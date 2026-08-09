// Spend recording. One row per model call.
//
// This replaces ocr_usage, which counted input/output tokens. Those stopped
// determining spend once caching landed — a cached token bills at a fraction of
// an uncached one — and the auto router's per-token rate varies by whichever
// model it picked. The settled cost the provider reports is the only figure
// that survives both, so that is what gets stored.

import type { QueryFn } from "../../db/mod.ts";

export interface UsageRecord {
  userId: string;
  /** Null for calls not tied to a chat: substitutions, chat-title generation. */
  sessionId?: string | null;
  /** The model the router actually chose, not the id that was requested. */
  model: string;
  /** Null when the provider reported no cost — distinct from free. */
  cost: number | null;
}

/**
 * Record one model call. Best-effort: accounting must never fail a user-facing
 * request, so errors are logged and swallowed.
 */
export async function recordUsage(
  q: QueryFn,
  rec: UsageRecord,
): Promise<void> {
  try {
    await q(
      `INSERT INTO llm_usage (user_id, session_id, model, cost_usd)
       VALUES ($1, $2, $3, $4)`,
      [rec.userId, rec.sessionId ?? null, rec.model, rec.cost],
    );
  } catch (e) {
    console.error("[usage] failed to record spend:", (e as Error).message);
  }
}
