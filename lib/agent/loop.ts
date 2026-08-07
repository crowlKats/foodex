// The agentic turn loop. The triggering event (user_message or
// conflict_resolve_request) must already be appended before calling runTurn.
//
// Each round: fold the log into Anthropic messages, call the model, and (if it
// used tools) execute them (DB reads only), then persist the assistant message
// and all tool results together in one transaction so the log is never left with
// a tool_use that has no tool_result.

import Anthropic from "@anthropic-ai/sdk";
import type { QueryFn } from "../../db/mod.ts";
import type { AgentSession } from "../../db/types.ts";
import type { AgentEvent, AgentEventBody } from "./events.ts";
import { appendEvent, loadEvents } from "./session.ts";
import { foldConversation, type PendingImageBlock } from "./conversation.ts";
import { executeTool, TOOLS } from "./tools.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { getFile } from "../s3.ts";

// A fast, low-cost model with no extended thinking: recipe staging is largely a
// mechanical data transform, not deep reasoning. (Haiku 4.5 does not support
// adaptive thinking / effort; omit them entirely.)
const MODEL = "claude-haiku-4-5";
// Turns that carry photos use the stronger vision model instead: deciphering
// hand-written pages is what the old OCR pipeline used it for, and Haiku gives
// up (and starts asking the user) on handwriting Sonnet reads fine.
const VISION_MODEL = "claude-sonnet-4-6";
const MAX_STEPS = 24;
const MAX_TOKENS = 8192;

export type TurnEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | {
    type: "tool_use_start";
    tool_use_id: string;
    name: string;
    input: unknown;
  }
  | {
    type: "tool_result";
    tool_use_id: string;
    name: string;
    is_error: boolean;
    summary: string;
  }
  | { type: "staging_updated" }
  | { type: "message_complete"; seq: number }
  | { type: "error"; message: string };

interface Db {
  query: QueryFn;
  transaction: <T>(fn: (q: QueryFn) => Promise<T>) => Promise<T>;
}

export interface RunTurnOpts {
  db: Db;
  session: AgentSession;
  emit: (ev: TurnEvent) => void | Promise<void>;
}

// ── attached images ─────────────────────────────────────────────────

async function loadBase64(key: string): Promise<string | null> {
  const f = await getFile(key);
  if (!f) return null;
  const bytes = new Uint8Array(await new Response(f.body).arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function hasImageBlock(messages: Anthropic.MessageParam[]): boolean {
  return messages.some((m) =>
    Array.isArray(m.content) &&
    m.content.some((b) => (b as { type: string }).type === "image")
  );
}

/**
 * Replace the fold's `foodex_image` placeholder blocks with base64 image
 * blocks read from S3. `cache` spans the steps of one turn, so each image is
 * fetched at most once per turn.
 */
async function resolveImageBlocks(
  messages: Anthropic.MessageParam[],
  cache: Map<string, string | null>,
): Promise<Anthropic.MessageParam[]> {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m);
      continue;
    }
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const b of m.content) {
      if ((b as { type: string }).type !== "foodex_image") {
        blocks.push(b as Anthropic.ContentBlockParam);
        continue;
      }
      const img = b as unknown as PendingImageBlock;
      let data = cache.get(img.key);
      if (data === undefined) {
        data = await loadBase64(img.key);
        cache.set(img.key, data);
      }
      blocks.push(
        data == null
          ? { type: "text", text: "[attached image is no longer available]" }
          : {
            type: "image",
            source: {
              type: "base64",
              media_type: img
                .content_type as Anthropic.Base64ImageSource["media_type"],
              data,
            },
          },
      );
    }
    out.push({ ...m, content: blocks });
  }
  return out;
}

function summarize(content: unknown, isError: boolean): string {
  const s = typeof content === "string" ? content : JSON.stringify(content);
  const short = s.length > 200 ? s.slice(0, 200) + "…" : s;
  return isError ? `error: ${short}` : short;
}

/**
 * A short, human-readable chat title distilled from the conversation so far.
 * Called after the first and second completed turns to refine the title beyond
 * the truncated first message. Returns null if it can't produce one.
 */
export async function generateChatTitle(
  events: AgentEvent[],
): Promise<string | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const parts: string[] = [];
  for (const ev of events) {
    if (ev.type === "user_message") {
      const photos = (ev.payload.images?.length ?? 0) > 0
        ? " [attached photos]"
        : "";
      parts.push(`User: ${ev.payload.text}${photos}`);
    } else if (ev.type === "assistant_message") {
      const text = (ev.payload.content as Anthropic.ContentBlock[])
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (text) parts.push(`Assistant: ${text}`);
    }
  }
  if (parts.length === 0) return null;
  const transcript = parts.join("\n").slice(0, 4000);

  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 24,
    system:
      "You title a cooking-assistant chat. Reply with ONLY the title: 3–6 " +
      "words, Title Case, describing what the chat is about. No surrounding " +
      "quotes, no trailing punctuation.",
    messages: [{
      role: "user",
      content: `Conversation so far:\n${transcript}\n\nTitle:`,
    }],
  });
  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ");
  const title = raw
    .trim()
    .replace(/^["'“”\s]+|["'“”\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return title || null;
}

export async function runTurn(opts: RunTurnOpts): Promise<void> {
  const { db, session, emit } = opts;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await emit({ type: "error", message: "ANTHROPIC_API_KEY is not set" });
    return;
  }
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
  const system = buildSystemPrompt();
  const householdId = session.household_id;

  // Any failure anywhere in the turn surfaces as an error event, so the client
  // never hangs on a spinner without explanation.
  try {
    let events = await loadEvents(db.query, session.id, session.head_seq);
    const imageCache = new Map<string, string | null>();

    for (let step = 0; step < MAX_STEPS; step++) {
      const folded = foldConversation(events);
      if (folded.apiMessages.length === 0) return;
      const apiMessages = await resolveImageBlocks(
        folded.apiMessages,
        imageCache,
      );

      // Stream the model's response, emitting text token deltas as they arrive;
      // `finalMessage()` assembles the complete message (content blocks, usage,
      // stop_reason) for persistence and tool execution.
      const stream = client.messages.stream({
        model: hasImageBlock(apiMessages) ? VISION_MODEL : MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: TOOLS,
        messages: apiMessages,
      });
      for await (const ev of stream) {
        if (ev.type !== "content_block_delta") continue;
        if (ev.delta.type === "text_delta" && ev.delta.text) {
          await emit({ type: "text_delta", text: ev.delta.text });
        } else if (ev.delta.type === "thinking_delta" && ev.delta.thinking) {
          await emit({ type: "thinking_delta", text: ev.delta.thinking });
        }
      }
      const response: Anthropic.Message = await stream.finalMessage();

      // Token accounting (best-effort).
      await db.query(
        `INSERT INTO ocr_usage (user_id, input_tokens, output_tokens, model)
       VALUES ($1, $2, $3, $4)`,
        [
          session.user_id,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.model,
        ],
      ).catch(() => {});

      const assistantBody: AgentEventBody = {
        type: "assistant_message",
        payload: {
          content: response.content,
          usage: {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            model: response.model,
          },
        },
      };

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        let seq = 0;
        await db.transaction(async (q) => {
          seq = await appendEvent(q, session.id, assistantBody);
        });
        await emit({ type: "message_complete", seq });
        return;
      }

      // Execute tools (reads only) against a local mirror so later tools in the
      // same batch see earlier results (for the read-before-write derivation).
      const local: AgentEvent[] = [...events];
      let provisional = local.length ? local[local.length - 1].seq : 0;
      const toolResultBodies: AgentEventBody[] = [];

      for (const tu of toolUses) {
        await emit({
          type: "tool_use_start",
          tool_use_id: tu.id,
          name: tu.name,
          input: tu.input,
        });
        const res = await executeTool(tu.name, tu.input, tu.id, {
          q: db.query,
          householdId,
          events: local,
        });
        const body: AgentEventBody = {
          type: "tool_result",
          payload: {
            tool_use_id: tu.id,
            tool_name: tu.name,
            is_error: res.is_error,
            content: res.content,
            observations: res.observations,
            staged: res.staged,
          },
        };
        provisional += 1;
        local.push({ ...body, seq: provisional } as AgentEvent);
        toolResultBodies.push(body);
        await emit({
          type: "tool_result",
          tool_use_id: tu.id,
          name: tu.name,
          is_error: res.is_error,
          summary: summarize(res.content, res.is_error),
        });
        if (res.staged) await emit({ type: "staging_updated" });
      }

      // Persist assistant + all tool results atomically.
      await db.transaction(async (q) => {
        await appendEvent(q, session.id, assistantBody);
        for (const b of toolResultBodies) await appendEvent(q, session.id, b);
      });

      events = await loadEvents(db.query, session.id, session.head_seq);
    }

    await emit({
      type: "error",
      message: "Reached the tool-step limit for this turn.",
    });
  } catch (e) {
    await emit({ type: "error", message: (e as Error).message });
  }
}
