// Conversion between the log's stored format and the AI SDK request format.
//
// The event log stores provider-neutral blocks (see events.ts); the SDK wants
// its own message shape. Converting here — and only here — keeps the durable
// format independent of whichever SDK or model is in use.
//
// Two structural differences to bridge:
//   - A tool result is a block inside a user turn in our fold, but its own
//     `role: "tool"` message in the SDK.
//   - Attached images are stored as S3 references and resolved to bytes just
//     before sending, so the fold stays pure (see resolveImages in loop.ts).

import type { AssistantContent, ModelMessage, ToolResultPart } from "ai";
import type { ProviderOptions } from "./model.ts";
import type { AssistantBlock } from "./events.ts";
import type { FoldMessage } from "./conversation.ts";

/**
 * Convert folded messages into AI SDK messages.
 *
 * Tool results are emitted as their own `tool` message ahead of any remaining
 * user parts, so each result stays adjacent to the assistant turn that asked
 * for it.
 */
export function toModelMessages(messages: FoldMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (const m of messages) {
    if (m.role === "assistant") {
      const parts: AssistantContent = [];
      for (const b of m.content) {
        if (b.type === "text") {
          parts.push({ type: "text", text: b.text });
        } else if (b.type === "tool_call") {
          parts.push({
            type: "tool-call",
            toolCallId: b.id,
            toolName: b.name,
            input: b.input,
          });
        }
      }
      if (parts.length > 0) out.push({ role: "assistant", content: parts });
      continue;
    }

    const results: ToolResultPart[] = [];
    const parts: Exclude<ModelMessage & { role: "user" }, never>["content"] =
      [];
    for (const b of m.content) {
      switch (b.type) {
        case "tool_result":
          results.push({
            type: "tool-result",
            toolCallId: b.tool_call_id,
            toolName: b.tool_name,
            output: b.is_error
              ? { type: "error-text", value: b.content }
              : { type: "text", value: b.content },
          });
          break;
        case "text":
          if (Array.isArray(parts)) parts.push({ type: "text", text: b.text });
          break;
        case "image":
          // Tagged `{ type: "data" }` with raw bytes. A bare string `data` is
          // tried as a URL first by the AI SDK (`new URL(content)`), so base64
          // (or a leaked serve URL) never reaches the vision model as pixels.
          if (Array.isArray(parts)) {
            parts.push({
              type: "file",
              data: { type: "data", data: b.data },
              mediaType: b.media_type,
            });
          }
          break;
      }
    }
    if (results.length > 0) out.push({ role: "tool", content: results });
    if (Array.isArray(parts) && parts.length > 0) {
      out.push({ role: "user", content: parts });
    }
  }

  return out;
}

/**
 * Convert an SDK assistant response into the log's stored blocks.
 *
 * Reasoning parts are intentionally dropped: they are provider-specific, often
 * unavailable on replay, and the log is replayed as conversation history.
 */
export function toAssistantBlocks(
  content: Array<{ type: string; [k: string]: unknown }>,
): AssistantBlock[] {
  const out: AssistantBlock[] = [];
  for (const part of content) {
    if (part.type === "text") {
      out.push({ type: "text", text: part.text as string });
    } else if (part.type === "tool-call") {
      out.push({
        type: "tool_call",
        id: part.toolCallId as string,
        name: part.toolName as string,
        input: part.input,
      });
    }
  }
  return out;
}

/**
 * Attach a cache breakpoint to the final part of the last message. Copies
 * rather than mutating — the caller rebuilds messages each step, but the parts
 * behind them are shared.
 *
 * Note the 20-block lookback limit: a breakpoint only searches back 20 content
 * blocks, so a step that fans out into many parallel tool calls can push the
 * previous breakpoint out of range and silently miss.
 */
export function withBreakpoint(
  messages: ModelMessage[],
  providerOptions: ProviderOptions,
): ModelMessage[] {
  if (messages.length === 0) return messages;
  const out = [...messages];
  const last = out[out.length - 1];
  if (typeof last.content === "string" || last.content.length === 0) return out;

  const parts = [...last.content];
  // Cast: the part union includes approval-request variants that carry no
  // providerOptions, but those never appear in messages we build.
  parts[parts.length - 1] = {
    ...parts[parts.length - 1],
    providerOptions,
  } as typeof parts[number];
  out[out.length - 1] = { ...last, content: parts } as ModelMessage;
  return out;
}
