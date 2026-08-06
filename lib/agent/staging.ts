// Staging projection: `foldStaging` reduces the event log into the current set of
// staged items. Nothing here reads or writes the database — it is a pure fold, so
// the same function serves the API, the tools, and the tests. Apply-to-DB lives in
// apply.ts (M3).

import { applyPatch, deepEqual, type PatchOp } from "./merge.ts";
import type { AgentEvent, StagedKind } from "./events.ts";
import type { StagingTarget } from "./events.ts";

export interface StagedItem {
  id: string;
  kind: StagedKind;
  target?: StagingTarget;
  /** modify/edit kinds: live version + snapshot captured when the item was seeded. */
  base_version?: string;
  base_data?: Record<string, unknown>;
  /** create kinds: the full proposed object. */
  full?: Record<string, unknown>;
  /** modify/edit kinds: accumulated patch ops. */
  ops: PatchOp[];
  /** Revert targets — the state as of the last AGENT write. */
  agent_ops: PatchOp[];
  agent_full?: Record<string, unknown>;
  /** Version token = seq of the last event that mutated this item. */
  last_seq: number;
  status: "pending" | "applied" | "discarded";
}

function isCreate(kind: StagedKind): boolean {
  return kind === "create_recipe" || kind === "create_ingredient";
}

/** The user-visible / apply-time value of a staged item. */
export function effective(item: StagedItem): Record<string, unknown> {
  if (isCreate(item.kind)) return item.full ?? {};
  return applyPatch(item.base_data ?? {}, item.ops);
}

/** The value the agent last proposed (revert target). */
export function agentProposal(item: StagedItem): Record<string, unknown> {
  if (isCreate(item.kind)) return item.agent_full ?? {};
  return applyPatch(item.base_data ?? {}, item.agent_ops);
}

/** True when the user has manually diverged the item from the agent's proposal. */
export function isUserEdited(item: StagedItem): boolean {
  return !deepEqual(effective(item), agentProposal(item));
}

/**
 * Reduce the (already head-filtered, seq-ordered) event log into staged items.
 * Only tool_result events carrying a resolved `staged` mutation, plus the
 * user_edit/revert/discard/apply events, affect staging.
 */
export function foldStaging(events: AgentEvent[]): Map<string, StagedItem> {
  const items = new Map<string, StagedItem>();

  for (const ev of events) {
    switch (ev.type) {
      case "tool_result": {
        const st = ev.payload.staged;
        if (!st) break;
        if (st.op === "create") {
          items.set(st.item_id, {
            id: st.item_id,
            kind: st.kind,
            full: st.full,
            agent_full: st.full,
            ops: [],
            agent_ops: [],
            last_seq: ev.seq,
            status: "pending",
          });
        } else if (st.op === "seed") {
          items.set(st.item_id, {
            id: st.item_id,
            kind: st.kind,
            target: st.target,
            base_version: st.base_version,
            base_data: st.base_data,
            ops: [...st.ops],
            agent_ops: [...st.ops],
            last_seq: ev.seq,
            status: "pending",
          });
        } else if (st.op === "update") {
          const it = items.get(st.item_id);
          if (!it) break;
          if (isCreate(it.kind) && st.full) {
            it.full = st.full;
            it.agent_full = st.full;
          } else if (st.ops) {
            it.ops = [...it.ops, ...st.ops];
            it.agent_ops = [...it.ops];
          }
          it.last_seq = ev.seq;
        } else if (st.op === "discard") {
          const it = items.get(st.item_id);
          if (it) {
            it.status = "discarded";
            it.last_seq = ev.seq;
          }
        }
        break;
      }
      case "user_staged": {
        const st = ev.payload.mutation;
        items.set(st.item_id, {
          id: st.item_id,
          kind: st.kind,
          full: st.full,
          agent_full: st.full,
          ops: [],
          agent_ops: [],
          last_seq: ev.seq,
          status: "pending",
        });
        break;
      }
      case "user_edit": {
        const it = items.get(ev.payload.item_id);
        if (!it) break;
        if (isCreate(it.kind)) {
          it.full = applyPatch(it.full ?? {}, ev.payload.ops);
        } else {
          it.ops = [...it.ops, ...ev.payload.ops];
        }
        it.last_seq = ev.seq; // agent_* deliberately untouched
        break;
      }
      case "user_revert": {
        const it = items.get(ev.payload.item_id);
        if (!it) break;
        if (isCreate(it.kind)) it.full = it.agent_full;
        else it.ops = [...it.agent_ops];
        it.last_seq = ev.seq;
        break;
      }
      case "user_discard": {
        const it = items.get(ev.payload.item_id);
        if (it) {
          it.status = "discarded";
          it.last_seq = ev.seq;
        }
        break;
      }
      case "apply": {
        const it = items.get(ev.payload.item_id);
        if (it) {
          it.status = "applied";
          it.last_seq = ev.seq;
        }
        break;
      }
    }
  }

  return items;
}

/** Pending items only, in creation order. */
export function pendingItems(map: Map<string, StagedItem>): StagedItem[] {
  return [...map.values()].filter((it) => it.status === "pending");
}

export interface SerializedStagedItem {
  id: string;
  kind: StagedKind;
  target: StagingTarget | null;
  base_version: string | null;
  version: number;
  /** For modify/edit kinds: the pre-change snapshot (for a diff view). Null for creates. */
  base_data: Record<string, unknown> | null;
  effective: Record<string, unknown>;
  agent_proposal: Record<string, unknown>;
  user_edited: boolean;
}

/** Shape sent to the client for the staging panel. */
export function serializePending(
  map: Map<string, StagedItem>,
): SerializedStagedItem[] {
  return pendingItems(map).map((it) => ({
    id: it.id,
    kind: it.kind,
    target: it.target ?? null,
    base_version: it.base_version ?? null,
    version: it.last_seq,
    base_data: isCreate(it.kind) ? null : it.base_data ?? {},
    effective: effective(it),
    agent_proposal: agentProposal(it),
    user_edited: isUserEdited(it),
  }));
}
