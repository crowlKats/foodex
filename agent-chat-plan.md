# Agentic Recipe Chat — Implementation Plan

A standalone, per-user chat where an AI agent reads recipe/ingredient data and the
web, and proposes changes into a per-session **staging area** that the user reviews,
edits, and applies to real household data.

This document is the authoritative spec. It captures every decision made during design.

---

## 0. Design decisions (locked)

| # | Decision |
|---|---|
| 1 | Chat streams over **SSE** (Claude-like UX). Tool loop runs server-side inside the stream. |
| 2 | Sessions are **per-user private** (not household-shared). Staged changes still apply to shared household data. |
| 3 | Apply UI: each staged item has a **checkbox** (default checked) + **revert** button. Footer button reads **"Apply all"** when all checked, **"Apply N changes"** otherwise. |
| 4 | Staging tools are **symmetric on the create/edit axis**: `stage_create_recipe`, `stage_modify_recipe`, `stage_create_ingredient`, `stage_edit_ingredient`. Every *edit/modify* tool structurally requires `base_version`; every *create* forbids it. |
| 5 | Modifications are stored as a **diff (patch ops, keyed — never array indices)** against a base snapshot, not a full replacement recipe. Creates are stored as full objects. |
| 6 | **Apply never invokes the agent.** Apply is a pure user action. If the live resource drifted since staging, the item enters a **merge-conflict** state with an **"Ask AI to resolve"** button. The agent runs only on explicit user action, and its resolution is a new proposal the user reviews before re-applying. |
| 7 | The session is an **append-only event log**. Staging and conversation are both **pure folds (projections)** over that log — nothing about staging is stored as independent mutable rows. |
| 8 | Read-before-write is enforced **server-side**: the agent passes no version tokens. The server derives the agent's observed version from the log (the version its last read/write result reported) and checks it against the current version. |
| 9 | **User edits are locked out during the agent's turn** (panel read-only while streaming/tool-looping). A pending field edit is committed as a `user_edit` event *before* a new turn starts, so nothing typed is dropped. |
| 10 | Merge-conflict detection is **path-level 3-way** (only overlapping changed paths conflict), not "any version drift". |
| 11 | Rollback truncates the log at a **turn boundary** (just before a `user_message`), but **never past an `apply`** — apply is a hard barrier. Committed side-effects are therefore never orphaned. |

---

## 1. Architecture: event-sourced session

The single source of truth is an ordered, append-only **event log** per session
(`agent_events`). Two pure reducers project it:

```
                         ┌─────────────────────────────┐
   append events         │        agent_events         │
 (agent tool calls,      │  ordered log per session    │
  user edits, applies)   └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                                 ▼
        foldConversation()                                  foldStaging()
    → Anthropic messages[]                          → Map<itemId, StagedItem>
    → chat display timeline                          → panel + list_staged tool
```

Benefits this model gives us for free:
- **No sync problem** between message history and staging (one log, two views).
- **Manual-edit awareness** is intrinsic: user edits are events already interleaved in
  the log; the conversation projection renders them as a collapsed notice before the
  next turn.
- **Rollback / time-travel**: truncate the log at a seq and both projections recompute.
- **Derived version tokens**: an item's version is the seq of the last event that
  touched it — the read-before-write guard needs no mutable column.

---

## 2. Data model (migrations)

Latest existing migration is `054`. Add:

### `db/migrations/055_agent_chat.sql`

```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  -- rollback head: events with seq > head_seq are logically truncated (NULL = live head)
  head_seq BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id, updated_at DESC);

CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  seq BIGSERIAL,                 -- global monotonic order (session-scoped via ORDER BY)
  type TEXT NOT NULL,            -- see §3
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_events_session ON agent_events(session_id, seq);

-- ingredients need a concurrency token (currently only have created_at)
ALTER TABLE ingredients ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
```

> Rollback is implemented as `head_seq` (soft truncate) rather than deleting rows, so a
> rollback is reversible and auditable. All reads filter `seq <= COALESCE(head_seq, ∞)`.
> A hard "prune" can be added later.

### `db/types.ts` additions

```ts
export interface AgentSession {
  id: string; user_id: string; household_id: string;
  title: string; head_seq: number | null;
  created_at: string; updated_at: string;
}
export interface AgentEvent {
  id: string; session_id: string; seq: number;
  type: AgentEventType; payload: unknown; created_at: string;
}
```

Also: set `ingredients.updated_at = now()` in every ingredient UPDATE site
(`routes/ingredients/[id].tsx`, the apply path) so the token advances.

---

## 3. Event log: types & payload shapes

All events live in `lib/agent/events.ts` as a discriminated union.

```ts
export type AgentEventType =
  | "user_message"
  | "assistant_message"
  | "tool_result"
  | "user_edit"
  | "user_revert"
  | "user_discard"
  | "apply"
  | "conflict_resolve_request";
```

### Conversation events (agent turn)

```ts
// user typed a chat message
{ type: "user_message", payload: { text: string } }

// one assistant message = raw Anthropic content blocks (text / thinking / tool_use)
{ type: "assistant_message", payload: { content: Anthropic.ContentBlock[], usage: {...} } }

// result of executing ONE tool_use (grouped into a user message by the projection)
{ type: "tool_result", payload: {
    tool_use_id: string,
    tool_name: string,
    is_error: boolean,
    content: unknown,          // JSON returned to the model
} }
```

### Staging-mutation events

The agent's staging writes are **tool_use blocks inside `assistant_message`** — they are
not separate event types. The reducer interprets tool_use blocks whose name is a staging
write (`stage_create_recipe`, `stage_modify_recipe`, `stage_create_ingredient`,
`stage_edit_ingredient`, `update_staged_item`, `discard_staged_item`). This keeps the
Anthropic transcript and the staging mutations in one place.

The **item id** for an agent-created staging item is the `tool_use.id` of the
`stage_*` call that created it (stable, unique, already in the transcript).

### User-authored staging events

```ts
// user manually edits a staged item in the panel (structured patch ops)
{ type: "user_edit", payload: { item_id: string, ops: PatchOp[] } }

// user reverts an item to the agent's last proposal
{ type: "user_revert", payload: { item_id: string } }

// user removes an item from staging
{ type: "user_discard", payload: { item_id: string } }
```

### Apply / conflict events

```ts
// user applied item(s); records the committed side-effect
{ type: "apply", payload: {
    item_id: string,
    result: { kind: "recipe", recipe_id: string, slug: string }
           | { kind: "ingredient", ingredient_id: string },
} }

// user pressed "Ask AI to resolve" on a conflicted item; triggers a turn
{ type: "conflict_resolve_request", payload: {
    item_id: string,
    live_version: string,      // current updated_at of the live resource
    conflict_paths: string[],  // paths that overlapped
} }
```

---

## 4. Patch model (diffs for modifications)

A `modify_recipe` / `edit_ingredient` staged item = **base snapshot + accumulated patch
ops**. Effective value = `applyPatch(base_data, ops)`.

### Recipe representation seen by the agent (and used as `base_data`)

The existing `OcrRecipeData` shape **plus stable identifiers** so patches key on identity,
never array position:

- ingredients: keyed by existing `key` (snake_case).
- steps: keyed by **`id`** — the DB `recipe_steps.id` for existing steps; a temp id
  (`"tmp_<n>"`) for steps the agent adds.
- sections: keyed by existing `key` (kebab-case).
- tools: keyed by `tool_id`. refs: keyed by `referenced_recipe_id`. tags: keyed by value.

`get_recipe` must therefore emit step `id`s (it currently returns positional steps). This
is a required addition to the agent-facing loader.

### Patch ops

```ts
export type PatchOp =
  // scalar recipe/ingredient fields
  | { op: "set"; path: string; value: unknown }              // e.g. path "title", "prep_time"
  // keyed collections: ingredients | steps | sections | tools | refs | tags
  | { op: "add";     collection: Collection; value: object }
  | { op: "set";     collection: Collection; key: string; field: string; value: unknown }
  | { op: "remove";  collection: Collection; key: string }
  | { op: "reorder"; collection: Collection; order: string[] }; // list of keys/ids
```

`Collection = "ingredients" | "steps" | "sections" | "tools" | "refs" | "tags"`.
Key = `ingredient.key`, `step.id`, `section.key`, `tool_id`, `referenced_recipe_id`, tag value.

`applyPatch(base, ops)` folds ops onto a deep clone of `base` and returns the effective
object. Order matters; ops are stored in application order.

### Creates

`create_recipe` / `create_ingredient` items store a **full object** in the creating
tool_use payload — no base, no patch, no merge.

---

## 5. Reducers

### `foldStaging(events) → Map<itemId, StagedItem>`

```ts
interface StagedItem {
  id: string;                         // tool_use id of the creating stage_* call
  kind: "create_recipe" | "modify_recipe" | "create_ingredient" | "edit_ingredient";
  target?: { recipe_id?: string; slug?: string; ingredient_id?: string };
  base_version?: string;              // live updated_at captured at seed time (modify/edit)
  base_data?: object;                 // snapshot at seed time (modify/edit)
  full?: object;                      // full object (create kinds)
  ops: PatchOp[];                     // accumulated (modify/edit kinds)
  agent_ops: PatchOp[];               // ops as of the last AGENT write (revert target)
  agent_full?: object;                // full as of last agent write (create kinds)
  last_seq: number;                   // seq of last event touching this item = its version
  status: "pending" | "applied" | "discarded";
}
```

Reduction rules (process events in seq order, `seq <= head_seq`):

- `assistant_message` → for each staging tool_use block:
  - `stage_create_recipe` / `stage_create_ingredient`: create item, `full = value`,
    `agent_full = value`, `last_seq = seq`.
  - `stage_modify_recipe` / `stage_edit_ingredient`: create item with `base_version`,
    `base_data` (captured server-side from live at execution — stored in the matching
    `tool_result` payload), `ops = value.ops ?? []`, `agent_ops = ops`.
  - `update_staged_item`: append `ops` (or replace `full`); refresh `agent_ops`/`agent_full`;
    `last_seq = seq`.
  - `discard_staged_item`: `status = "discarded"`.
  - (The tool executor already ran the server-determined version guard — §6 — before
    writing the event, so only valid mutations ever reach the log.)
- `user_edit` → append `ops` to `item.ops` (or apply to `full`); **do not** touch
  `agent_ops`; `last_seq = seq`.
- `user_revert` → `ops = agent_ops` / `full = agent_full`; `last_seq = seq`.
- `user_discard` → `status = "discarded"`; `last_seq = seq`.
- `apply` → `status = "applied"`; `last_seq = seq`.

`effective(item)` = `item.full` (create) or `applyPatch(item.base_data, item.ops)` (modify).
Pending staging shown to the user = items with `status === "pending"`.

### `foldConversation(events) → { apiMessages, timeline }`

Produces the Anthropic `messages[]` for the next API call and the chat display timeline.

- `user_message` → `{ role: "user", content: [ ...pendingNotice?, {type:"text", text} ] }`.
  Before emitting it, drain accumulated `user_edit`/`user_revert`/`user_discard` since the
  previous turn into **one collapsed notice text block** describing the *net current
  effective state* of each affected item (computed from `foldStaging`). Prepend it to this
  user message's content. Also emit a display-only `notice` entry in the timeline.
- `assistant_message` → `{ role: "assistant", content }` (verbatim blocks).
- consecutive `tool_result` → grouped into one `{ role: "user", content: [tool_result...] }`
  immediately following their assistant message (Anthropic requires every `tool_use` be
  answered).
- `conflict_resolve_request` → emitted as a `user` message: *"The recipe changed since you
  staged item X. Live version vs your staged diff follow; produce a resolved edit.
  Conflicting paths: …"* + the current live recipe + the staged effective. Triggers a turn.
- `user_edit`/`user_revert`/`user_discard` are **never** sent as their own API messages —
  only as the collapsed notice above.

Turn-boundary invariant: `apiMessages` always ends cleanly (no dangling `tool_use`),
because a turn only completes when `stop_reason !== "tool_use"`.

---

## 6. Read-before-write & version guard (server-determined)

The agent **never passes version tokens**. The server derives them from the session's own
log, so a read-then-write is all the agent has to do.

- **Observed version** — for any target (recipe by slug/id, ingredient by id, staged item
  by id): the version the agent has most recently *seen* = the `version` recorded in the
  most recent `tool_result` (read **or** write) that referenced that target, at
  `seq <= head`. Every read (`get_recipe`, `list_recipes`, `get_ingredient`,
  `list_ingredients`, `get_staged`, `list_staged`) and every write result (`stage_*`,
  `update_staged_item`) records a `version` in its tool_result payload — so a write's own
  result refreshes the observed version, enabling chained edits without re-reading.
- **Current version** — live `updated_at` for recipes/ingredients; `last_seq` for staged
  items (from `foldStaging`).
- **Guard on every write** (run in the tool executor, before appending the tool_result
  event):
  1. No observed version for the target → `is_error`: *"read it first
     (get_recipe / get_staged)."*
  2. `observed !== current` → `is_error`: *"it changed since you read it; re-read and
     retry."* — appends **no** staging change.
  3. Else proceed. For the seed tools (`stage_modify_recipe` / `stage_edit_ingredient`),
     `base_version = observed` (== current) and `base_data` = the live snapshot, both
     captured server-side.
- Because a turn holds no user edits (§9), the only mid-turn drift source for live
  recipes/ingredients is another session — correctly caught. For staged items, a
  `user_edit` between turns advances `last_seq` past the agent's observed version, so the
  next blind write is rejected until the agent re-reads. Same guarantee as the token-echo
  design, with no token threading.

---

## 7. Tools

Defined in `lib/agent/tools.ts` as `Anthropic.Tool[]` + an `executeTool(name, input, ctx)`
dispatcher returning `{ content, is_error }`. `ctx = { db, userId, householdId, sessionId,
foldStaging(), foldConversation() }`. All queries are **household-scoped**.

### Read tools

| Tool | Input | Returns |
|---|---|---|
| `list_recipes` | `{ search?, ingredient?, limit?, offset? }` | recipe rows (title, slug, description, tags, times) + `version` (updated_at). Full-text/ingredient filter via `escapeLike`. |
| `get_recipe` | `{ slug }` | full recipe as agent-representation (§4, **with step ids**) + `version`. |
| `list_ingredients` | `{ search? }` | `{ id, name, unit, density, version }[]`. |
| `get_ingredient` | `{ id }` | `{ id, name, unit, density, version }`. |
| `fetch_url` | `{ url }` | raw page text (truncated), via shared `fetchPage`. **SSRF-guarded** (block localhost/private/link-local/metadata IPs; http/https only). |
| `web_search` | `{ query }` | Jina `s.jina.ai` results (title/url/snippet). |
| `fetch_page_summary` | `{ url }` | Jina `r.jina.ai` readable markdown (SSRF-guarded). |
| `list_staged` | `{}` | pending items: `{ id, kind, title, version, status }[]`. |
| `get_staged` | `{ id }` | `{ id, kind, base_version?, effective, ops?, version }`. |

### Write tools (staging only)

| Tool | Input | Rule |
|---|---|---|
| `stage_create_recipe` | `{ recipe: FullRecipe }` | create kind — no version needed. |
| `stage_modify_recipe` | `{ slug, ops: PatchOp[] }` | requires a prior `get_recipe`; server derives + checks the observed version (§6) and snapshots `base_data`. |
| `stage_create_ingredient` | `{ name, unit?, density? }` | create kind — no version needed. |
| `stage_edit_ingredient` | `{ ingredient_id, ops: PatchOp[] }` | requires a prior read; server derives + checks the observed version (§6). |
| `update_staged_item` | `{ id, ops: PatchOp[] }` (or `{ recipe }`/`{ fields }` for create kinds) | requires a prior `get_staged`/create result; server checks observed version vs `last_seq` (§6). |
| `discard_staged_item` | `{ id }` | server checks observed version vs `last_seq` (§6). |

No write tool takes a version/base_version argument — the server determines them from the
log (§6). The agent workflow: read (`get_recipe`) → `stage_modify_recipe` (opens item +
first ops) → further `update_staged_item` calls to refine. Reads are cheap; writes are
guarded server-side.

---

## 8. Agent loop + SSE

### `lib/agent/loop.ts` — `runTurn(session, trigger, emit)`

`trigger` = a `user_message` or `conflict_resolve_request` (already appended to the log).

```
1. messages = foldConversation(events).apiMessages
2. loop:
   a. stream = client.messages.stream({ model, system, tools, messages, thinking })
   b. relay text_delta / thinking_delta via emit()  → SSE
   c. on completion, append assistant_message event (content blocks + usage)
   d. if stop_reason !== "tool_use": break
   e. for each tool_use block:
        - emit tool_use_start
        - { content, is_error } = executeTool(...)   // guards run here
        - append tool_result event
        - emit tool_result
      append tool_results to `messages` as a user turn; continue loop
3. emit staging_updated (client refetches panel) and message_complete
```

- Model: `claude-sonnet-4-6` (matches existing usage), `thinking` adaptive/summarized,
  reasonable `max_tokens`.
- Token accounting: insert into `ocr_usage` per API call (reuse existing table).
- Concurrency: a session may have **one** in-flight turn. A lightweight per-session lock
  (advisory lock or a `turn_active` guard checked against the log tail) rejects overlapping
  sends; the UI disables send + locks the panel while streaming (§9).

### SSE event contract — `routes/api/agent/[id]/message.tsx` (`POST`, `text/event-stream`)

| event | data |
|---|---|
| `text_delta` | `{ text }` |
| `thinking_delta` | `{ text }` |
| `tool_use_start` | `{ tool_use_id, name, input }` |
| `tool_result` | `{ tool_use_id, name, is_error, summary }` |
| `staging_updated` | `{}` (client refetches `/api/agent/[id]/staging`) |
| `message_complete` | `{ seq }` |
| `error` | `{ message }` |

Same-origin SSE → no CSP `connect-src` change needed. Assistant/tool events are persisted
as they complete, so a dropped connection is recoverable on reload (replay from log).

---

## 9. Turn locking & manual-edit capture

- While a turn is in flight, the staging panel is **read-only** ("agent is working"
  state). Enforced client-side (disabled inputs) and server-side (`user_edit` events for a
  session with an active turn are rejected).
- On **send** (or **Ask AI to resolve**), the client first flushes any pending in-progress
  field edit as a `user_edit` event, *then* appends the `user_message` /
  `conflict_resolve_request`. Nothing typed is dropped.
- Because edits only land between turns, the collapsed notice (§5) is unambiguous and the
  log order is well-defined.

---

## 10. Apply flow (never invokes the agent)

`routes/api/agent/[id]/staging.tsx` `POST { action: "apply", item_ids }`:

```
for each item_id (must be pending):
  item = foldStaging(...).get(item_id)
  eff  = effective(item)
  in a transaction:
    if kind is create_*:
      insert recipe/ingredient from `eff`   (recipes reuse the draft→publish path)
    else (modify/edit):
      live = load current recipe/ingredient
      if live.updated_at !== item.base_version:
        // path-level 3-way check
        conflicts = overlappingChangedPaths(item.base_data, live, item.ops)   // §11
        if conflicts.nonEmpty:
          mark this item CONFLICT (return conflict_paths, live_version); skip apply
          continue
        // no path overlap → safe auto-merge: rebase ops onto live and apply
      merged = applyPatch(currentAgentRepr(live), item.ops)
      update recipe scalars + replace children from `merged`
      set updated_at = now()
    append `apply` event (records result)
return { applied: [...], conflicts: [{ item_id, conflict_paths, live_version }] }
```

- Batch apply: cleanly-appliable checked items commit; conflicted ones are returned and
  the panel flips them to a **merge-conflict** card. **No agent involvement.**
- The **"Ask AI to resolve"** button appends a `conflict_resolve_request` event and starts
  a turn (§8). The agent re-reads live via `get_recipe` (fresh `base_version`) and
  re-stages a resolved patch, which the user reviews and re-applies. The agent thus never
  changes anything at apply time.

Recipe apply reuses a **structured** variant of `saveRecipeChildren`
(`saveRecipeChildrenFromData(q, recipeId, recipeData)`) factored out of the current
FormData-based one so chat and the draft/edit routes share one code path.

---

## 11. Merge algorithm (path-level 3-way)

```
overlappingChangedPaths(base, live, ops):
  livePaths = changedPaths(base, live)        // set of paths where live differs from base
  return [ op for op in ops if pathOf(op) ∈ livePaths (or intersects for add/remove/reorder) ]
```

- `pathOf({op:"set", path})` = that scalar path.
- `pathOf({collection,key,field})` = `"<collection>[<key>].<field>"`.
- add/remove/reorder over a collection intersect live changes to the *same key* (or the
  collection's order for reorder).
- Empty result → clean auto-merge (live changed only untouched paths); apply.
- Non-empty → conflict; surface `conflict_paths` to the UI, do not apply.

Strict mode (any drift = conflict) is a one-line switch if desired, but path-level is the
default and keeps the same never-clobber guarantee with fewer false conflicts.

---

## 12. Rollback

- `routes/api/agent/[id]/rollback.tsx` `POST { seq }` sets `agent_sessions.head_seq = seq`,
  where `seq` must be a **turn boundary** (immediately before a `user_message`). All folds
  filter `seq <= head_seq`.
- **You cannot roll back past an `apply`.** Apply is a hard barrier: the valid rollback
  target range is `(seq_of_last_apply_event, current_head]` (or from the start if the
  session has no applies). The UI only offers rollback points after the most recent apply;
  the API rejects any `seq <= seq_of_last_apply`.
- Because rollback can never cross an apply, committed side-effects (real recipe/ingredient
  writes) are never orphaned or re-staged — no undo of real data is ever implied.
- Re-sending after a rollback appends new events (seq keeps incrementing); the truncated
  tail is simply ignored. (A later "prune" can hard-delete `seq > head_seq`.)

---

## 13. Routes

Pages:
- `routes/agent/index.tsx` — session list (own user only) + "New chat".
- `routes/agent/[id].tsx` — SSR loads session + `foldConversation` timeline +
  `foldStaging` pending items (403 if `session.user_id !== ctx.state.user.id`); renders
  `AgentChat` + `StagingPanel` islands.

API (all guard `session.user_id === ctx.state.user.id`, rate-limited via `rateLimit`):
- `routes/api/agent/index.tsx` — `POST` create session.
- `routes/api/agent/[id]/index.tsx` — `GET` state, `DELETE` session.
- `routes/api/agent/[id]/message.tsx` — `POST` (SSE) run a turn.
- `routes/api/agent/[id]/staging.tsx` — `GET` list; `POST { action }` where action ∈
  `edit` (append `user_edit`), `revert`, `discard`, `apply`, `resolve_conflict` (append
  `conflict_resolve_request` then start a turn).
- `routes/api/agent/[id]/rollback.tsx` — `POST { seq }`.

New Zod schemas in `lib/validation.ts` for each body (mirror existing patterns).

---

## 14. Frontend (islands)

- **`islands/AgentChat.tsx`** — Claude-style column: timeline (assistant text via `marked`,
  collapsible tool-call chips showing name/input/result, thinking toggle reusing the
  `RefineInput` pattern, `notice` entries for user edits), sticky composer. Consumes the
  SSE stream; disables composer + emits panel-lock while a turn runs.
- **`islands/StagingPanel.tsx`** — list of pending staged-item cards:
  - Each card: **checkbox** (default checked), **revert** button (enabled only when
    `effective ≠ agent proposal`, i.e. user edited it), and an **editable form** showing
    **every field** (diff-highlighted for modify items: base → proposed).
    - Recipe cards embed existing form islands (`IngredientForm`, `StepForm`,
      `QuantityInput`, `MultiSearchSelect`, source/tags/times/output) — same components as
      `DraftEditor`, so "every field visualized and editable" reuses proven UI.
    - Ingredient cards: name/unit/density form.
  - Field edits → debounced `POST {action:"edit", ops}` (translated to PatchOps for modify
    items; a full-object replace for create items). Read-only while a turn is in flight.
  - Merge-conflict cards: distinct state, list `conflict_paths`, **"Ask AI to resolve"**
    button (→ `resolve_conflict`).
  - Footer: dynamic label — **"Apply all"** when all pending checked, **"Apply N changes"**
    otherwise; disabled while streaming. `POST {action:"apply", item_ids}`.
  - Refetches on `staging_updated` SSE events so agent-made changes appear live.

UI style follows existing conventions (sharp `.card`, `border-2`, orange accent, no
rounded corners).

---

## 15. Reused / refactored code

| Existing | Change |
|---|---|
| `lib/url-import.ts` `fetchPage` (private) | extract to `lib/fetch-page.ts` (browser headers + Jina fallback + **SSRF guard**); reuse in url-import, `fetch_url`, `fetch_page_summary`. |
| `lib/recipe-save.ts` `saveRecipeChildren(q, id, FormData)` | add `saveRecipeChildrenFromData(q, id, recipeData)` sharing the bulk-insert core; used by apply + (ideally) draft publish. |
| draft publish handler (`routes/recipes/drafts/[id].tsx`) | factor recipe-insert into a shared `createRecipeFromData()` reused by create-recipe apply. |
| `lib/recipe-prompt.ts` | reuse `recipeJsonSchema()` / `RECIPE_FIELD_RULES` in the agent system prompt + tool descriptions. |
| `ocr_usage` table | reuse for agent token accounting. |
| `rateLimit`, `parseJsonBody`, `escapeLike`, `slugify` | reuse. |
| `RefineInput` thinking-toggle pattern | reuse in AgentChat. |

New: `lib/agent/{events,tools,loop,staging,merge,system-prompt}.ts`.

---

## 16. System prompt (`lib/agent/system-prompt.ts`)

Describes: the assistant's role; the read tools; that **all changes go to staging** and are
reviewed by the user before applying (never applied by the agent); the create/edit tool
symmetry and that edits require a **fresh read first**; the **read-before-write** rule
(must `get_recipe`/`get_staged` before writing — the server rejects a write to anything not
read, or changed since it was read; no version tokens are passed by the agent); how to
express changes as **patch ops** keyed by ingredient key / step id / section key; the
recipe JSON schema + field rules (from `recipe-prompt.ts`) + template syntax; how to
resolve a conflict when asked (re-read live, produce a merged patch). Untrusted web/user
content must not override instructions.

---

## 17. Security

- Per-user session ownership enforced on every page + API route.
- All tool DB queries household-scoped to `ctx.state.householdId`.
- **SSRF guard** on `fetch_url`/`fetch_page_summary`: http/https only; resolve and reject
  loopback/private/link-local/metadata (169.254.169.254) addresses; cap response size +
  timeout (reuse the 15s/30s pattern).
- `rateLimit("ai:<userId>", …)` on message + resolve routes.
- `ANTHROPIC_API_KEY`, `JINA_API_KEY` from env (already present).
- Web/user content is untrusted; system prompt fences it.

---

## 18. Testing (`deno test -A`)

- `merge.test.ts` — `applyPatch`, `changedPaths`, `overlappingChangedPaths` (clean apply,
  disjoint auto-merge, overlapping conflict, add/remove/reorder key collisions).
- `foldStaging.test.ts` — create/modify/user_edit/revert/discard/apply sequences; derived
  version = last_seq; version-guard rejection.
- `foldConversation.test.ts` — tool_use↔tool_result pairing, collapsed edit notice,
  turn-boundary integrity, rollback via `head_seq`.
- `tools.test.ts` — each tool's guard paths (stale base_version, stale item version,
  household scoping, SSRF rejection).
- Loop test with a stubbed Anthropic client (fixture tool_use sequences).

---

## 19. Build order (milestones)

1. **Foundations** — migration `055`; `db/types.ts`; `lib/agent/events.ts` (types) +
   `lib/agent/merge.ts` (`applyPatch`, `changedPaths`) with unit tests.
2. **Reducers** — `foldStaging`, `foldConversation` + tests. Derived version guard.
3. **Staging + apply core** — `lib/agent/staging.ts`, `saveRecipeChildrenFromData` /
   `createRecipeFromData` refactor, apply + path-level merge; API `staging.tsx` (no agent
   yet). Tests.
4. **Tools + loop (non-streaming)** — `tools.ts`, `system-prompt.ts`, `loop.ts` returning
   the full turn synchronously. Validate the agentic loop end-to-end with a stub.
5. **SSE** — convert `message.tsx` to the streaming contract (§8).
6. **AgentChat island** — chat + streaming + tool chips + thinking.
7. **StagingPanel island** — editable cards, checkboxes, revert, dynamic apply,
   conflict state + "Ask AI to resolve".
8. **Manual-edit notice + turn locking** wiring (§9), rollback (§12).
9. **Session list page**, nav entry, polish, `deno task check` clean.

---

## 20. Open items to confirm during build

- Whether draft publish should be migrated onto the shared `createRecipeFromData` now or
  left as-is (low risk either way).
- Snapshot cache for very long sessions (`staging_snapshot`) — deferred until needed.
