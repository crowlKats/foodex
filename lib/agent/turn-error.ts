// Chat-visible copy for a failed or empty assistant turn. The SSE `error`
// event is the only way the composer learns the turn died; an empty message
// or a multi-megabyte JSON dump of image bytes both look like silence.

const MAX_TURN_ERROR = 1500;

/**
 * Human-readable turn failure for the chat UI. Never empty, never a
 * JSON-serialized Uint8Array (`{0:255,1:216,…}`).
 */
export function formatTurnError(e: unknown): string {
  let msg = "";
  if (e instanceof Error) msg = e.message;
  else if (typeof e === "string") msg = e;
  msg = msg.trim();
  if (!msg || msg === "[object Object]") {
    return "The assistant failed to respond.";
  }
  if (msg.length > MAX_TURN_ERROR) return `${msg.slice(0, MAX_TURN_ERROR)}…`;
  return msg;
}

/**
 * If the model produced no text and no tool calls, return the error to emit
 * instead of persisting a blank assistant bubble.
 */
export function emptyAssistantError(
  content: { type: string }[],
  finishReason: string | undefined,
): string | null {
  if (content.length > 0) return null;
  if (finishReason && finishReason !== "stop") {
    return `The assistant returned no content (${finishReason}).`;
  }
  return "The assistant returned no content.";
}
