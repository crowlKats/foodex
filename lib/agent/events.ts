// The session event log. `agent_events` rows are an ordered, append-only log;
// staging and conversation are pure folds over it (see staging.ts / conversation.ts).
//
// Design notes:
//  - Agent staging writes are executed server-side; the *resolved* effect (with
//    server-captured base_data, resolved ids, etc.) is recorded in the tool_result
//    event's `staged` field. The staging reducer folds over those, NOT over the raw
//    tool_use inputs, so it never has to re-resolve anything.
//  - `observations` on a tool_result records which targets the agent saw and at what
//    version, so the read-before-write guard (see tools.ts) can derive the observed
//    version straight from the log without re-parsing tool content.

import type { PatchOp } from "./merge.ts";

// ── Stored content format ──────────────────────────────────────────
//
// Deliberately our own, not a provider's. The log is the durable record and
// outlives whichever model or SDK is in use; a vendor type here would make an
// external schema the storage contract, and changing providers would mean
// migrating history. Conversion to the request format happens at send time
// (see translate.ts).

/** A block of an assistant turn as stored in the log. */
export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown };

export type StagedKind =
  | "create_recipe"
  | "edit_recipe"
  | "create_ingredient"
  | "edit_ingredient";

/** A normalized (target, version) pair the agent observed via a read/write result. */
export interface Observation {
  /** Stable target key: `recipe:<id>`, `ingredient:<id>`, or `staged:<itemId>`. */
  target: string;
  version: string;
}

/** The resolved effect of an agent staging write, recorded on its tool_result. */
export type StagingMutation =
  | {
    kind: "create_recipe" | "create_ingredient";
    op: "create";
    item_id: string;
    full: Record<string, unknown>;
  }
  | {
    kind: "edit_recipe" | "edit_ingredient";
    op: "seed";
    item_id: string;
    target: StagingTarget;
    base_version: string;
    base_data: Record<string, unknown>;
    ops: PatchOp[];
  }
  | {
    op: "update";
    item_id: string;
    ops?: PatchOp[];
    full?: Record<string, unknown>;
  }
  | { op: "discard"; item_id: string };

export interface StagingTarget {
  recipe_id?: string;
  slug?: string;
  ingredient_id?: string;
}

export interface ApplyResult {
  kind: "recipe" | "ingredient";
  recipe_id?: string;
  slug?: string;
  ingredient_id?: string;
}

// ── Event payloads ─────────────────────────────────────────────────

/** An image attached to a user message, denormalized so folds never hit the DB. */
export interface UserMessageImage {
  media_id: string;
  key: string;
  content_type: string;
  /** App-relative serve URL, for rendering in the chat. */
  url: string;
}

export interface UserMessageEvent {
  type: "user_message";
  payload: { text: string; images?: UserMessageImage[] };
}

export interface AssistantMessageEvent {
  type: "assistant_message";
  payload: {
    content: AssistantBlock[];
    // Token counts only. Cost lives in llm_usage, not here — duplicating it
    // would give two sources of truth for the same number.
    usage: {
      // Uncached prompt tokens only. The full prompt is this plus the two
      // cache figures below; see the prompt-caching breakpoints in loop.ts.
      input_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens: number;
      model: string;
    };
  };
}

export interface ToolResultEvent {
  type: "tool_result";
  payload: {
    tool_use_id: string;
    tool_name: string;
    is_error: boolean;
    /** JSON returned to the model. */
    content: unknown;
    /** Targets+versions this result exposed (reads and successful write results). */
    observations?: Observation[];
    /** Resolved staging effect, present only for a successful staging write. */
    staged?: StagingMutation;
  };
}

/**
 * A staging created directly by the user, without a model turn (e.g. a legacy
 * recipe draft migrated into a session). Only `create` mutations.
 */
export interface UserStagedEvent {
  type: "user_staged";
  payload: { mutation: Extract<StagingMutation, { op: "create" }> };
}

export interface UserEditEvent {
  type: "user_edit";
  payload: { item_id: string; ops: PatchOp[] };
}

export interface UserRevertEvent {
  type: "user_revert";
  payload: { item_id: string };
}

export interface UserDiscardEvent {
  type: "user_discard";
  payload: { item_id: string };
}

export interface ApplyEvent {
  type: "apply";
  payload: { item_id: string; result: ApplyResult };
}

export interface ConflictResolveRequestEvent {
  type: "conflict_resolve_request";
  payload: { item_id: string; live_version: string; conflict_paths: string[] };
}

export type AgentEventBody =
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolResultEvent
  | UserStagedEvent
  | UserEditEvent
  | UserRevertEvent
  | UserDiscardEvent
  | ApplyEvent
  | ConflictResolveRequestEvent;

export type AgentEventType = AgentEventBody["type"];

/** A persisted event: an `AgentEventBody` plus its log position. */
export type AgentEvent = AgentEventBody & { seq: number };

/** Narrow a persisted row (with unknown payload) to a typed event. */
export function toAgentEvent(
  row: { seq: number; type: string; payload: unknown },
): AgentEvent {
  return { seq: row.seq, type: row.type, payload: row.payload } as AgentEvent;
}
