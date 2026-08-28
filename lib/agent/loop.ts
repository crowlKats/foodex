// The agentic turn loop. The triggering event (user_message or
// conflict_resolve_request) must already be appended before calling runTurn.
//
// Each round: fold the log into messages, call the model, and — if it used
// tools — execute them, then persist the assistant message and all tool results
// together in one transaction so the log is never left with a tool_call that
// has no tool_result.
//
// Most tools only read, but some mutate directly (pantry, plan, shopping list).
// Those writes land outside the persisting transaction, so a crash mid-batch
// can leave a write with no log entry.

import { generateText, jsonSchema, streamText, tool, type ToolSet } from "ai";
import { cacheControl, costOf, getModel, hasCredentials } from "./model.ts";
import {
  toAssistantBlocks,
  toModelMessages,
  withBreakpoint,
} from "./translate.ts";
import type { QueryFn } from "../../db/mod.ts";
import type { AgentSession } from "../../db/types.ts";
import type { AgentEvent, AgentEventBody, AssistantBlock } from "./events.ts";
import { recordUsage } from "./usage.ts";
import { appendEvent, loadEvents } from "./session.ts";
import { foldConversation } from "./conversation.ts";
import { executeTool, TOOLS } from "./tools.ts";
import { buildSystemPrompt } from "./system-prompt.ts";
import { resolveImages } from "./images.ts";
import { emptyAssistantError, formatTurnError } from "./turn-error.ts";

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

// Tool schemas are reused verbatim from TOOLS — the AI SDK accepts the existing
// JSON Schema, so there is no second source of truth to keep in sync. No
// `execute` is supplied: the loop below runs tools itself and persists each
// result, which the SDK supports by simply returning the tool calls.
const AI_TOOLS: ToolSet = Object.fromEntries(
  TOOLS.map((t) => [
    t.name,
    tool({
      description: t.description,
      inputSchema: jsonSchema(t.input_schema as object),
    }),
  ]),
);

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
  if (!hasCredentials()) return null;

  const parts: string[] = [];
  for (const ev of events) {
    if (ev.type === "user_message") {
      const photos = (ev.payload.images?.length ?? 0) > 0
        ? " [attached photos]"
        : "";
      parts.push(`User: ${ev.payload.text}${photos}`);
    } else if (ev.type === "assistant_message") {
      const text = ev.payload.content
        .filter((b): b is Extract<AssistantBlock, { type: "text" }> =>
          b.type === "text"
        )
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (text) parts.push(`Assistant: ${text}`);
    }
  }
  if (parts.length === 0) return null;
  const transcript = parts.join("\n").slice(0, 4000);

  // No cache breakpoint here: this prompt is ~40 tokens, far below every
  // provider's minimum cacheable prefix, so a marker would be a no-op.
  const { text } = await generateText({
    model: getModel(),
    maxOutputTokens: 24,
    instructions:
      "You title a cooking-assistant chat. Reply with ONLY the title: 3–6 " +
      "words, Title Case, describing what the chat is about. No surrounding " +
      "quotes, no trailing punctuation.",
    messages: [{
      role: "user",
      content: `Conversation so far:\n${transcript}\n\nTitle:`,
    }],
  });
  const title = text
    .trim()
    .replace(/^["'“”\s]+|["'“”\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return title || null;
}

export async function runTurn(opts: RunTurnOpts): Promise<void> {
  const { db, session, emit } = opts;
  if (!hasCredentials()) {
    await emit({
      type: "error",
      message: "OPENROUTER_API_KEY is not set",
    });
    return;
  }
  const system = buildSystemPrompt();
  const householdId = session.household_id;

  // Any failure anywhere in the turn surfaces as an error event, so the client
  // never hangs on a spinner without explanation.
  try {
    let events = await loadEvents(db.query, session.id, session.head_seq);
    const imageCache = new Map<string, Uint8Array>();

    for (let step = 0; step < MAX_STEPS; step++) {
      const folded = foldConversation(events);
      if (folded.apiMessages.length === 0) return;
      const apiMessages = await resolveImages(
        folded.apiMessages,
        imageCache,
      );

      // Stream the model's response, emitting text deltas as they arrive. The
      // system prompt goes in `instructions` as a SystemModelMessage so it can
      // carry the cache breakpoint: tools and instructions both render ahead of
      // the messages, so this one marker caches the whole ~8k-token fixed
      // prefix. Nothing in it varies by user or session, so it is a single
      // shared entry per model rather than one per conversation — keep it that
      // way.
      const result = streamText({
        model: getModel(),
        maxOutputTokens: MAX_TOKENS,
        instructions: {
          role: "system",
          content: system,
          providerOptions: cacheControl(),
        },
        tools: AI_TOOLS,
        messages: withBreakpoint(toModelMessages(apiMessages), cacheControl()),
      });
      let streamError: Error | null = null;
      for await (const part of result.stream) {
        if (part.type === "text-delta" && part.text) {
          await emit({ type: "text_delta", text: part.text });
        } else if (part.type === "reasoning-delta" && part.text) {
          await emit({ type: "thinking_delta", text: part.text });
        } else if (part.type === "error") {
          streamError = part.error instanceof Error
            ? part.error
            : new Error(formatTurnError(part.error));
        }
      }
      // A failed request surfaces as an error part rather than a rejected
      // promise, so rethrow instead of persisting a truncated assistant turn.
      if (streamError) throw streamError;

      const content = toAssistantBlocks(
        await result.content as Array<{ type: string; [k: string]: unknown }>,
      );
      const usage = await result.usage;
      const finishReason = await result.finishReason;
      const empty = emptyAssistantError(content, finishReason);
      if (empty) throw new Error(empty);
      const modelId = (await result.response).modelId;
      const cost = costOf((await result.finalStep).providerMetadata);

      // Best-effort spend record. Token counts stay on the event; cost is the
      // number that actually matters and lives only here, so there is one
      // source of truth for it.
      await recordUsage(db.query, {
        userId: session.user_id,
        sessionId: session.id,
        model: modelId,
        cost,
      });

      const details = usage.inputTokenDetails;
      const cacheWrite = details?.cacheWriteTokens ?? 0;
      const cacheRead = details?.cacheReadTokens ?? 0;
      const uncached = details?.noCacheTokens ?? usage.inputTokens ?? 0;
      const assistantBody: AgentEventBody = {
        type: "assistant_message",
        payload: {
          content,
          usage: {
            input_tokens: uncached,
            cache_creation_input_tokens: cacheWrite,
            cache_read_input_tokens: cacheRead,
            output_tokens: usage.outputTokens ?? 0,
            model: modelId,
          },
        },
      };

      const toolUses = content.filter(
        (b): b is Extract<AssistantBlock, { type: "tool_call" }> =>
          b.type === "tool_call",
      );

      if (finishReason !== "tool-calls" || toolUses.length === 0) {
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
    await emit({ type: "error", message: formatTurnError(e) });
  }
}
