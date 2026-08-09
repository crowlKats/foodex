// Conversation projection: `foldConversation` reduces the event log into the
// messages for the next API call and a display timeline for the chat UI.
//
// The messages it emits are provider-neutral; translate.ts converts them to the
// SDK's shape at send time.
//
// User edits/reverts/discards are NEVER sent as their own API messages; they are
// collapsed into a single "here's what the user changed since your last reply" notice
// prepended to the next user turn, computed from the point-in-time staging state.

import type {
  AgentEvent,
  AssistantBlock,
  StagedKind,
  UserMessageImage,
} from "./events.ts";
import { effective, foldStaging, type StagedItem } from "./staging.ts";

/**
 * Reference to an attached image. The fold is pure and cannot read S3, so it
 * emits these markers; the turn loop swaps them for `image` blocks carrying the
 * bytes just before calling the API (see resolveImages).
 */
export interface PendingImageBlock {
  type: "image_ref";
  media_id: string;
  key: string;
  content_type: string;
}

/** A block of a user turn as sent to the model. */
export type UserBlock =
  | { type: "text"; text: string }
  | PendingImageBlock
  | { type: "image"; data: string; media_type: string }
  | {
    type: "tool_result";
    tool_call_id: string;
    tool_name: string;
    is_error: boolean;
    content: string;
  };

/** A message in the folded conversation, before conversion to the SDK shape. */
export type FoldMessage =
  | { role: "user"; content: UserBlock[] }
  | { role: "assistant"; content: AssistantBlock[] };

/**
 * The change a single stage tool call made, as a before/after snapshot: the
 * item as it was just before the call vs. just after. For a creation `before`
 * is null (the addition itself); for a seed it's the pre-edit base; for an
 * update it's the item's prior effective value.
 */
export interface StagedDiff {
  item_id: string;
  kind: StagedKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export type TimelineEntry =
  | {
    kind: "user";
    text: string;
    images?: { media_id: string; url: string }[];
  }
  | { kind: "assistant"; content: AssistantBlock[] }
  | {
    kind: "tool_result";
    tool_use_id: string;
    tool_name: string;
    is_error: boolean;
    content: unknown;
    staged_diff?: StagedDiff;
  }
  | { kind: "notice"; text: string }
  | {
    kind: "user_action";
    action: "applied" | "discarded" | "edited" | "reverted" | "staged";
    items: string[];
  };

export interface Conversation {
  apiMessages: FoldMessage[];
  timeline: TimelineEntry[];
}

function itemLabel(it: StagedItem): string {
  const eff = effective(it);
  const name = (eff.title ?? eff.name ?? "(untitled)") as string;
  return `${it.kind} "${name}" (staged id ${it.id})`;
}

/**
 * The pre-turn notice describing staged items the user edited/discarded/applied
 * since the last turn. `api` is sent to the model so it stays in sync; nothing
 * here is shown in the chat (`display` is always null); these are internal
 * system notes, and applied changes already appear as "Applied …" entries.
 */
function buildNotice(
  touched: Set<string>,
  applied: string[],
  events: AgentEvent[],
  upToIndex: number,
): { api: string | null; display: string | null } {
  const staging = foldStaging(events.slice(0, upToIndex));

  const editLines: string[] = [];
  for (const id of touched) {
    const it = staging.get(id);
    if (!it || it.status === "applied") continue;
    if (it.status === "discarded") {
      editLines.push(`- ${itemLabel(it)} was DISCARDED by the user.`);
    } else {
      editLines.push(
        `- ${itemLabel(it)} is now:\n${JSON.stringify(effective(it), null, 2)}`,
      );
    }
  }
  const editNotice = editLines.length > 0
    ? [
      "[System note] Since your last message the user manually changed the",
      "staging area. Current state of the affected items:",
      ...editLines,
    ].join("\n")
    : null;

  const appliedNotice = applied.length > 0
    ? `[System note] The user APPLIED and saved these staged changes to the ` +
      `real data; they are now live and no longer in the staging area: ` +
      `${applied.join("; ")}.`
    : null;

  const api = [editNotice, appliedNotice].filter(Boolean).join("\n\n") || null;
  return { api, display: editNotice };
}

export function foldConversation(events: AgentEvent[]): Conversation {
  const apiMessages: FoldMessage[] = [];
  const timeline: TimelineEntry[] = [];

  let pendingToolResults: Extract<UserBlock, { type: "tool_result" }>[] = [];
  let touchedSinceTurn = new Set<string>();
  let appliedSinceTurn: string[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      apiMessages.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  // A `kind “name”` label for the staged item as of event index `i`.
  const lineFor = (i: number, itemId: string, fallback?: string): string => {
    const it = foldStaging(events.slice(0, i + 1)).get(itemId);
    const eff = it ? effective(it) : null;
    const name = String(eff?.title ?? eff?.name ?? fallback ?? "a change");
    const kind = it && it.kind.includes("ingredient") ? "ingredient" : "recipe";
    return `${kind} “${name}”`;
  };

  // Record a user action (apply/discard/edit/revert) in the chat, grouping a run
  // of the same action into one compact block.
  const pushAction = (
    action: "applied" | "discarded" | "edited" | "reverted" | "staged",
    line: string,
  ) => {
    const last = timeline[timeline.length - 1];
    if (last?.kind === "user_action" && last.action === action) {
      if (!last.items.includes(line)) last.items.push(line);
    } else timeline.push({ kind: "user_action", action, items: [line] });
  };

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    switch (ev.type) {
      case "user_message": {
        flushToolResults();
        const notice = buildNotice(
          touchedSinceTurn,
          appliedSinceTurn,
          events,
          i,
        );
        touchedSinceTurn = new Set();
        appliedSinceTurn = [];
        const content: UserBlock[] = [];
        if (notice.api) content.push({ type: "text", text: notice.api });
        if (notice.display) {
          timeline.push({ kind: "notice", text: notice.display });
        }
        const images: UserMessageImage[] = ev.payload.images ?? [];
        for (const img of images) {
          // The media id is stated in text so the model can reference the
          // image (e.g. set it as a recipe's cover_image_id).
          content.push({
            type: "text",
            text: `Attached image (media id: ${img.media_id}):`,
          });
          content.push({
            type: "image_ref",
            media_id: img.media_id,
            key: img.key,
            content_type: img.content_type,
          });
        }
        if (ev.payload.text) {
          content.push({ type: "text", text: ev.payload.text });
        }
        apiMessages.push({ role: "user", content });
        timeline.push({
          kind: "user",
          text: ev.payload.text,
          images: images.length > 0
            ? images.map((im) => ({ media_id: im.media_id, url: im.url }))
            : undefined,
        });
        break;
      }
      case "assistant_message": {
        flushToolResults();
        apiMessages.push({
          role: "assistant",
          content: ev.payload.content,
        });
        timeline.push({ kind: "assistant", content: ev.payload.content });
        break;
      }
      case "tool_result": {
        const p = ev.payload;
        pendingToolResults.push({
          type: "tool_result",
          tool_call_id: p.tool_use_id,
          // Carried through from the log, so the send-time conversion no longer
          // has to reconstruct it by tracking ids past the matching tool_call.
          tool_name: p.tool_name,
          content: typeof p.content === "string"
            ? p.content
            : JSON.stringify(p.content),
          is_error: p.is_error,
        });
        // A stage tool call's before/after snapshot, so the chat can show the
        // exact change it made (diffed against the item's previous version).
        let staged_diff: StagedDiff | undefined;
        const st = p.staged;
        if (st && st.op !== "discard") {
          const afterItem = foldStaging(events.slice(0, i + 1)).get(st.item_id);
          if (afterItem) {
            let before: Record<string, unknown> | null;
            if (st.op === "create") before = null;
            else if (st.op === "seed") before = st.base_data;
            else {
              const beforeItem = foldStaging(events.slice(0, i)).get(
                st.item_id,
              );
              before = beforeItem ? effective(beforeItem) : null;
            }
            staged_diff = {
              item_id: st.item_id,
              kind: afterItem.kind,
              before,
              after: effective(afterItem),
            };
          }
        }
        timeline.push({
          kind: "tool_result",
          tool_use_id: p.tool_use_id,
          tool_name: p.tool_name,
          is_error: p.is_error,
          content: p.content,
          staged_diff,
        });
        break;
      }
      case "conflict_resolve_request": {
        flushToolResults();
        const notice = buildNotice(
          touchedSinceTurn,
          appliedSinceTurn,
          events,
          i,
        );
        touchedSinceTurn = new Set();
        appliedSinceTurn = [];
        const conflictMsg =
          `The live recipe/ingredient behind staged item ${ev.payload.item_id} ` +
          `changed since you staged your edit (conflicting fields: ` +
          `${ev.payload.conflict_paths.join(", ") || "none reported"}). ` +
          `Re-read the current version with get_recipe/get_proposed, reconcile your ` +
          `staged diff against it, and update the staged item so it applies cleanly.`;
        const text = [notice.api, conflictMsg].filter(Boolean).join("\n\n");
        apiMessages.push({ role: "user", content: [{ type: "text", text }] });
        timeline.push({
          kind: "notice",
          text: [notice.display, conflictMsg].filter(Boolean).join("\n\n"),
        });
        break;
      }
      case "user_staged":
        touchedSinceTurn.add(ev.payload.mutation.item_id);
        pushAction("staged", lineFor(i, ev.payload.mutation.item_id));
        break;
      case "user_edit":
        touchedSinceTurn.add(ev.payload.item_id);
        pushAction("edited", lineFor(i, ev.payload.item_id));
        break;
      case "user_revert":
        touchedSinceTurn.add(ev.payload.item_id);
        pushAction("reverted", lineFor(i, ev.payload.item_id));
        break;
      case "user_discard":
        touchedSinceTurn.add(ev.payload.item_id);
        pushAction("discarded", lineFor(i, ev.payload.item_id));
        break;
      case "apply": {
        // Applied changes are shown in the chat so the user has a record.
        const line = lineFor(i, ev.payload.item_id, ev.payload.result.slug);
        pushAction("applied", line);
        appliedSinceTurn.push(line);
        break;
      }
    }
  }

  flushToolResults();
  return { apiMessages, timeline };
}
