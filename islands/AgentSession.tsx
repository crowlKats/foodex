import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { IconSend } from "@tabler/icons-preact";
import { IconLoader2 } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { IconArrowBackUp } from "@tabler/icons-preact";
import { IconAlertTriangle } from "@tabler/icons-preact";
import { IconDeviceFloppy } from "@tabler/icons-preact";
import { IconX } from "@tabler/icons-preact";
import { IconPencil } from "@tabler/icons-preact";
import { IconPlus } from "@tabler/icons-preact";
import { IconSearch } from "@tabler/icons-preact";
import { IconEye } from "@tabler/icons-preact";
import { IconWorld } from "@tabler/icons-preact";
import { IconTool } from "@tabler/icons-preact";
import type { StagedDiff, TimelineEntry } from "../lib/agent/conversation.ts";
import type { SerializedStagedItem } from "../lib/agent/staging.ts";
import { Button, type IconComponent } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";
import { UNIT_GROUPS } from "../lib/units.ts";
import RecipeFields from "./RecipeFields.tsx";
import { Markdown } from "../components/Markdown.tsx";
import { formDataToRecipeData } from "../lib/recipe-form-data.ts";

interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  /** True for an ingredient staged in this session but not yet created. */
  staged?: boolean;
}

interface Props {
  sessionId: string;
  initialTimeline: TimelineEntry[];
  initialStaging: SerializedStagedItem[];
  initialTurnActive: boolean;
  ingredients: IngredientOption[];
  allTools: { id: string; name: string }[];
  allRecipes: { id: string; title: string }[];
}

interface LiveTool {
  id: string;
  name: string;
  input?: unknown;
  done?: boolean;
  is_error?: boolean;
  summary?: string;
}
// One assistant step within a turn: its streamed thinking/text and the tools it
// then called. A new segment starts when content arrives after a step's tools.
interface LiveSegment {
  thinking: string;
  text: string;
  tools: LiveTool[];
}
interface LiveTurn {
  segments: LiveSegment[];
}

interface ConflictInfo {
  conflict_paths: string[];
  live_version: string;
}

// deno-lint-ignore no-explicit-any
type Any = any;

// Starter prompts shown on an empty chat.
const EXAMPLE_PROMPTS = [
  "Add an authentic Neapolitan pizza recipe",
  "Find and add a traditional pad thai",
  "Import the recipe at this URL: ",
  "Make my pancakes recipe vegan",
  "Scale my bolognese to 6 servings",
];

export default function AgentSession(props: Props) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>(
    props.initialTimeline,
  );
  const [staging, setStaging] = useState<SerializedStagedItem[]>(
    props.initialStaging,
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [conflicts, setConflicts] = useState<Record<string, ConflictInfo>>({});
  const [turnActive, setTurnActive] = useState(props.initialTurnActive);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start scrolled to the newest message on load.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  const base = `/api/agent/${props.sessionId}`;

  const refetchState = useCallback(async () => {
    const res = await fetch(base);
    if (!res.ok) return;
    const data = await res.json();
    setTimeline(data.timeline);
    setStaging(data.staging);
    setTurnActive(data.turn_active);
  }, [base]);

  const refetchStaging = useCallback(async () => {
    const res = await fetch(`${base}/staging`);
    if (!res.ok) return;
    const data = await res.json();
    setStaging(data.items);
  }, [base]);

  const runStream = useCallback(async (body: unknown) => {
    setError(null);
    setTurnActive(true);
    setLive({ segments: [] });

    // Watchdog: the server sends a ping every 15s. If ~40s pass with no data at
    // all, the connection is dead — abort so we never hang on the spinner.
    const ctrl = new AbortController();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 40_000);
    };

    try {
      bump();
      const res = await fetch(`${base}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bump();
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          handleEvent(JSON.parse(dataLine.slice(5).trim()));
        }
      }
    } catch (e) {
      setError(
        ctrl.signal.aborted
          ? "Lost connection to the assistant. Reload the page to see the latest."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(watchdog);
      setLive(null);
      await refetchState();
      setTurnActive(false);
    }
  }, [base, refetchState]);

  function appendContent(kind: "text" | "thinking", text: string) {
    setLive((l) => {
      if (!l) return l;
      const segs = l.segments.slice();
      let seg = segs[segs.length - 1];
      // A new segment begins when content arrives after a step's tool calls.
      if (!seg || seg.tools.length > 0) {
        seg = { thinking: "", text: "", tools: [] };
        segs.push(seg);
      } else {
        seg = { ...seg };
        segs[segs.length - 1] = seg;
      }
      seg[kind] += text;
      return { segments: segs };
    });
  }

  function handleEvent(ev: Any) {
    switch (ev.type) {
      case "text_delta":
        appendContent("text", ev.text);
        break;
      case "thinking_delta":
        appendContent("thinking", ev.text);
        break;
      case "tool_use_start":
        setLive((l) => {
          if (!l) return l;
          const segs = l.segments.slice();
          let seg = segs[segs.length - 1];
          if (!seg) seg = { thinking: "", text: "", tools: [] };
          else seg = { ...seg, tools: seg.tools.slice() };
          seg.tools.push({
            id: ev.tool_use_id,
            name: ev.name,
            input: ev.input,
          });
          segs[segs.length === 0 ? 0 : segs.length - 1] = seg;
          return { segments: segs };
        });
        break;
      case "tool_result":
        setLive((l) =>
          l && {
            segments: l.segments.map((s) => ({
              ...s,
              tools: s.tools.map((t) =>
                t.id === ev.tool_use_id
                  ? {
                    ...t,
                    done: true,
                    is_error: ev.is_error,
                    summary: ev.summary,
                  }
                  : t
              ),
            })),
          }
        );
        break;
      case "staging_updated":
        refetchStaging();
        break;
      case "title": {
        // The header lives outside this island — update it (and the tab) live.
        const h1 = document.getElementById("agent-chat-title");
        if (h1) h1.textContent = ev.title;
        document.title = ev.title;
        break;
      }
      case "error":
        setError(ev.message);
        break;
    }
    queueMicrotask(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text || turnActive) return;
    setTimeline((t) => [...t, { kind: "user", text }]);
    setInput("");
    runStream({ text });
  }
  function send() {
    sendText(input);
  }

  // ── staging mutations ────────────────────────────────────────────
  async function postStaging(payload: unknown) {
    const res = await fetch(`${base}/staging`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Action failed");
      return null;
    }
    return data;
  }

  async function saveItem(id: string, data: Record<string, unknown>) {
    const r = await postStaging({ action: "edit", item_id: id, data });
    if (r?.items) setStaging(r.items);
  }
  async function revertItem(id: string) {
    const r = await postStaging({ action: "revert", item_id: id });
    if (r?.items) setStaging(r.items);
  }
  async function discardItem(id: string) {
    const r = await postStaging({ action: "discard", item_id: id });
    if (r?.items) setStaging(r.items);
  }
  async function applyChecked() {
    const ids = staging
      .filter((it) => isChecked(it.id) && !conflicts[it.id])
      .map((it) => it.id);
    if (ids.length === 0) return;
    const r = await postStaging({ action: "apply", item_ids: ids });
    if (!r) return;
    setStaging(r.items);
    const map: Record<string, ConflictInfo> = {};
    for (const c of r.conflicts ?? []) {
      map[c.item_id] = {
        conflict_paths: c.conflict_paths,
        live_version: c.live_version,
      };
    }
    setConflicts(map);
    // Close the modal once everything applied cleanly; keep it open to surface
    // any merge conflicts that need resolving.
    if ((r.applied?.length ?? 0) > 0) {
      await refetchState();
      if ((r.conflicts?.length ?? 0) === 0) setPreviewOpen(false);
    }
  }
  async function resolveConflict(id: string) {
    const info = conflicts[id];
    const r = await postStaging({
      action: "resolve_conflict",
      item_id: id,
      live_version: info?.live_version ?? "",
      conflict_paths: info?.conflict_paths ?? [],
    });
    if (!r) return;
    setConflicts((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
    runStream({ mode: "resume" });
  }

  const isChecked = (id: string) => checked[id] !== false;
  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !isChecked(id) }));
  }

  const checkedCount = useMemo(
    () => staging.filter((it) => isChecked(it.id) && !conflicts[it.id]).length,
    [staging, checked, conflicts],
  );
  const applyLabel = checkedCount === staging.length && staging.length > 0
    ? "Apply all"
    : `Apply ${checkedCount} change${checkedCount === 1 ? "" : "s"}`;

  // Ingredient picker options = existing entities + ingredients staged (but not
  // yet created) this session. Linking a recipe line to a staged one is resolved
  // (created + linked) when the recipe is applied.
  const ingredientOptions = useMemo<IngredientOption[]>(() => {
    const staged = staging
      .filter((it) => it.kind === "create_ingredient")
      .map((it) => ({
        id: it.id,
        name: String(it.effective.name ?? ""),
        unit: String(it.effective.unit ?? ""),
        staged: true,
      }));
    return [...props.ingredients, ...staged];
  }, [staging, props.ingredients]);

  // Persisted tool_use blocks pair with a later tool_result timeline entry;
  // map id → is_error so completed tool calls render a check or ✗.
  const toolStatus = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const e of timeline) {
      if (e.kind === "tool_result") m[e.tool_use_id] = e.is_error;
    }
    return m;
  }, [timeline]);

  // Per tool call, the before/after snapshot of the change it staged, so the
  // chat can render an inline diff card of exactly what that call did.
  const stagedDiffs = useMemo(() => {
    const m: Record<string, StagedDiff> = {};
    for (const e of timeline) {
      if (e.kind === "tool_result" && e.staged_diff) {
        m[e.tool_use_id] = e.staged_diff;
      }
    }
    return m;
  }, [timeline]);

  // Names for tool labels: which ingredient / staged item a call references.
  const names = useMemo<NameLookup>(() => {
    const ingredient: Record<string, string> = {};
    for (const g of props.ingredients) ingredient[g.id] = g.name;
    const staged: Record<string, string> = {};
    for (const it of staging) {
      const e = it.effective as Any;
      staged[it.id] = String(e.title ?? e.name ?? "");
    }
    return { ingredient, staged };
  }, [props.ingredients, staging]);

  const editingItem = editingId
    ? staging.find((it) => it.id === editingId) ?? null
    : null;

  // The right-hand drawer: editing an item takes precedence over the apply view
  // (so "Edit" from within apply returns to apply when closed).
  const drawerMode: "edit" | "apply" | null = editingItem
    ? "edit"
    : previewOpen
    ? "apply"
    : null;

  return (
    <div class="h-full flex overflow-hidden">
      {/* Chat column — pushed to a third as the drawer grows in from the right. */}
      <div
        class={`flex flex-col min-w-0 min-h-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
          drawerMode ? "w-0 md:w-1/3" : "w-full"
        }`}
      >
        {/* Messages */}
        <div ref={scrollRef} class="flex-1 overflow-y-auto px-4 py-6">
          <div class="max-w-3xl mx-auto space-y-4">
            {timeline.map((e, i) => (
              <TimelineItem
                key={i}
                entry={e}
                toolStatus={toolStatus}
                stagedDiffs={stagedDiffs}
                names={names}
                onEdit={(id) => {
                  setPreviewOpen(false);
                  setEditingId(id);
                }}
              />
            ))}
            {live && <LiveTurnView live={live} names={names} />}
            {timeline.length === 0 && !live && (
              <div class="space-y-3">
                <p class="text-stone-400 text-sm">
                  Ask me to find, create, or improve recipes and ingredients.
                  I'll propose changes here for you to review before anything is
                  applied. Try:
                </p>
                <div class="flex flex-wrap gap-1.5">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      disabled={turnActive}
                      class="border-2 border-stone-200 dark:border-stone-700 hover:border-orange-400 px-2.5 py-1 text-sm text-left disabled:opacity-50"
                      onClick={() =>
                        ex.endsWith(": ") ? setInput(ex) : sendText(ex)}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer with the staged-changes pills attached on top */}
        <div class="border-t-2 border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950">
          <div class="max-w-3xl mx-auto p-3 space-y-2">
            {error && <div class="alert-error text-sm">{error}</div>}
            {staging.length > 0 && (
              <div class="flex flex-wrap items-center gap-1.5">
                {staging.map((it) => {
                  const PillIcon = it.kind.startsWith("create")
                    ? IconPlus
                    : IconPencil;
                  const conflict = conflicts[it.id];
                  return (
                    <button
                      key={it.id}
                      type="button"
                      title="Edit"
                      class={`inline-flex items-center gap-1 border-2 px-2 py-0.5 text-sm max-w-[16rem] bg-white dark:bg-stone-900 hover:border-orange-400 ${
                        conflict
                          ? "border-red-400"
                          : "border-stone-200 dark:border-stone-700"
                      }`}
                      onClick={() => {
                        setPreviewOpen(false);
                        setEditingId(it.id);
                      }}
                    >
                      <PillIcon class="size-3.5 shrink-0 text-stone-400" />
                      <span class="truncate">{stagedName(it)}</span>
                      {conflict && (
                        <IconAlertTriangle class="size-3.5 shrink-0 text-red-500" />
                      )}
                    </button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  class="ml-auto shrink-0"
                  onClick={() => {
                    setEditingId(null);
                    setPreviewOpen(true);
                  }}
                >
                  Apply…
                </Button>
              </div>
            )}
            <div class="flex gap-2">
              <Input
                type="text"
                class="flex-1"
                placeholder="Message the assistant…"
                value={input}
                disabled={turnActive}
                onValueChange={setInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button
                type="button"
                onClick={send}
                disabled={turnActive || !input.trim()}
              >
                {turnActive
                  ? <IconLoader2 class="size-4 animate-spin" />
                  : <IconSend class="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {
        /* Right-hand drawer: edit an item, or review & apply. Always mounted so
          its width can animate in from the right, pushing the chat aside. */
      }
      <div
        class={`shrink-0 min-h-0 h-full overflow-hidden transition-[width] duration-300 ease-in-out ${
          drawerMode
            ? "w-full md:w-2/3 border-l-2 border-stone-200 dark:border-stone-700"
            : "w-0"
        }`}
      >
        {
          /* Fixed width = open width, so the content slides in as one piece
            instead of reflowing while the container animates. */
        }
        <div class="h-full w-screen md:w-[66.6667vw]">
          {drawerMode === "edit" && editingItem
            ? (
              <EditDrawer
                key={`${editingItem.id}:${editingItem.version}`}
                item={editingItem}
                ingredients={ingredientOptions.filter((g) =>
                  g.id !== editingItem.id
                )}
                allTools={props.allTools}
                allRecipes={props.allRecipes}
                onCancel={() => setEditingId(null)}
                onSave={async (data) => {
                  await saveItem(editingItem.id, data);
                  setEditingId(null);
                }}
              />
            )
            : drawerMode === "apply"
            ? (
              <ApplyDrawer
                staging={staging}
                turnActive={turnActive}
                conflicts={conflicts}
                checkedCount={checkedCount}
                applyLabel={applyLabel}
                isChecked={isChecked}
                onClose={() => setPreviewOpen(false)}
                onToggle={toggle}
                onEdit={(id) => setEditingId(id)}
                onRevert={revertItem}
                onDiscard={discardItem}
                onResolve={resolveConflict}
                onApply={applyChecked}
              />
            )
            : null}
        </div>
      </div>
    </div>
  );
}

// ── chat rendering ──────────────────────────────────────────────────

const USER_ACTION_META: Record<
  "applied" | "discarded" | "edited" | "reverted",
  { verb: string; icon: IconComponent; color: string }
> = {
  applied: {
    verb: "Applied",
    icon: IconDeviceFloppy,
    color: "text-green-600 dark:text-green-500",
  },
  discarded: {
    verb: "Discarded",
    icon: IconTrash,
    color: "text-red-500",
  },
  edited: {
    verb: "Edited",
    icon: IconPencil,
    color: "text-orange-500",
  },
  reverted: {
    verb: "Reverted",
    icon: IconArrowBackUp,
    color: "text-stone-400",
  },
};

function TimelineItem(
  { entry, toolStatus, stagedDiffs, names, onEdit }: {
    entry: TimelineEntry;
    toolStatus: Record<string, boolean>;
    stagedDiffs: Record<string, StagedDiff>;
    names: NameLookup;
    onEdit: (id: string) => void;
  },
) {
  if (entry.kind === "user") {
    return (
      <div class="flex justify-end">
        <div class="bg-orange-100 dark:bg-orange-950 px-3 py-2 max-w-[85%] text-sm">
          <Markdown text={entry.text} />
        </div>
      </div>
    );
  }
  if (entry.kind === "notice") {
    return <div class="text-xs text-stone-400 italic px-1">{entry.text}</div>;
  }
  if (entry.kind === "user_action") {
    // User actions (apply/discard/edit/revert) are shown on the user (right) side.
    const meta = USER_ACTION_META[entry.action];
    const Icon = meta.icon;
    return (
      <div class="flex justify-end">
        <div class="space-y-0.5">
          {entry.items.map((it, i) => (
            <div
              key={i}
              class="flex items-center justify-end gap-2 text-xs text-stone-500 dark:text-stone-400"
            >
              <Icon class={`size-3.5 shrink-0 ${meta.color}`} />
              {meta.verb} {it}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (entry.kind === "tool_result") {
    return null; // shown via the assistant's tool_use chips
  }
  // assistant
  const blocks = (entry as Any).content as Any[];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join(
    "",
  );
  const tools = blocks.filter((b) => b.type === "tool_use");
  return (
    <div class="space-y-1">
      {text && <Markdown text={text} class="text-sm" />}
      {tools.length > 0 && (
        <div class="space-y-1">
          {tools.map((t) => {
            const diff = stagedDiffs[t.id];
            return (
              <div key={t.id} class="space-y-1">
                <ToolChip
                  name={t.name}
                  input={t.input}
                  names={names}
                  status={t.id in toolStatus
                    ? (toolStatus[t.id] ? "error" : "done")
                    : "done"}
                />
                {diff && (
                  <div class="ml-5 border-2 border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900">
                    <div class="flex items-center gap-2 px-2.5 py-1.5 border-b-2 border-stone-200 dark:border-stone-700 text-xs">
                      <span class="uppercase tracking-wide text-stone-500">
                        {KIND_LABEL[diff.kind] ?? diff.kind}
                      </span>
                      <span class="font-medium truncate">
                        {stagedDiffName(diff)}
                      </span>
                      {/* Only editable while the item is still staged. */}
                      {diff.item_id in names.staged && (
                        <Button
                          type="button"
                          variant="ghost"
                          icon={IconPencil}
                          title="Edit"
                          class="ml-auto shrink-0"
                          onClick={() => onEdit(diff.item_id)}
                        />
                      )}
                    </div>
                    <div class="px-2.5 py-2">
                      <StagedItemDiff
                        before={diff.before}
                        after={diff.after}
                        kind={diff.kind}
                        compact
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LiveTurnView(
  { live, names }: { live: LiveTurn; names: NameLookup },
) {
  return (
    <div class="space-y-2">
      {live.segments.map((seg, i) => (
        <div key={i} class="space-y-1">
          {seg.thinking && (
            <details class="text-xs text-stone-400">
              <summary class="cursor-pointer">Thinking…</summary>
              <pre class="whitespace-pre-wrap font-mono mt-1">{seg.thinking}</pre>
            </details>
          )}
          {seg.text && <Markdown text={seg.text} class="text-sm" />}
          {seg.tools.length > 0 && (
            <div class="space-y-0.5">
              {seg.tools.map((t) => (
                <ToolChip
                  key={t.id}
                  name={t.name}
                  input={t.input}
                  names={names}
                  status={!t.done ? "pending" : t.is_error ? "error" : "done"}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Icon reflecting what a tool does (create/edit/search/read/…). */
function toolIcon(name: string): IconComponent {
  if (name === "create_recipe" || name === "create_ingredient") return IconPlus;
  if (
    name === "edit_recipe" || name === "edit_ingredient" ||
    name === "edit_proposed"
  ) return IconPencil;
  if (name === "discard_proposed") return IconTrash;
  if (name.startsWith("list_") || name === "web_search") return IconSearch;
  if (name.startsWith("get_")) return IconEye;
  if (name === "fetch_url" || name === "fetch_page_summary") return IconWorld;
  return IconTool;
}

function ToolChip(
  { name, input, status, names }: {
    name: string;
    input: Any;
    status: "pending" | "done" | "error";
    names?: NameLookup;
  },
) {
  const Icon = toolIcon(name);
  return (
    <div class="flex items-center gap-2 text-xs text-stone-500">
      {status === "pending"
        ? <IconLoader2 class="size-3.5 animate-spin text-stone-400 shrink-0" />
        : status === "error"
        ? <IconX class="size-3.5 text-red-500 shrink-0" />
        : <Icon class="size-3.5 text-stone-400 shrink-0" />}
      <span class={status === "error" ? "text-red-600" : ""}>
        {toolLabel(name, input, status, names)}
      </span>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// [present participle, past tense, bare infinitive] for each action verb, so a
// tool label can be rendered as "Searching …" / "Searched …" / "Failed to search …".
const TOOL_VERBS: Record<string, [string, string, string]> = {
  search: ["Searching", "Searched", "search"],
  read: ["Reading", "Read", "read"],
  list: ["Listing", "Listed", "list"],
  create: ["Creating", "Created", "create"],
  add: ["Adding", "Added", "add"],
  edit: ["Editing", "Edited", "edit"],
  fetch: ["Fetching", "Fetched", "fetch"],
  discard: ["Discarding", "Discarded", "discard"],
  update: ["Updating", "Updated", "update"],
  review: ["Reviewing", "Reviewed", "review"],
};

/** Resolves the display name of a referenced ingredient / staged item by id. */
interface NameLookup {
  ingredient: Record<string, string>;
  staged: Record<string, string>;
}

/** Friendly tool label whose verb tense reflects the call's status. */
function toolLabel(
  name: string,
  input: Any,
  status: "pending" | "done" | "error",
  names?: NameLookup,
): string {
  const i = input ?? {};
  const q = (v: unknown) => typeof v === "string" ? v : "";
  const ingName = () => names?.ingredient[q(i.id)];
  const stagedName = () => names?.staged[q(i.id)];
  let verb = "review";
  let obj = "";
  switch (name) {
    case "list_recipes":
      if (q(i.search)) [verb, obj] = ["search", `recipes for “${q(i.search)}”`];
      else if (q(i.ingredient)) {
        [verb, obj] = ["search", `recipes with ${q(i.ingredient)}`];
      } else [verb, obj] = ["list", "recipes"];
      break;
    case "get_recipe":
      [verb, obj] = ["read", `recipe “${q(i.slug)}”`];
      break;
    case "list_ingredients":
      [verb, obj] = q(i.search)
        ? ["search", `ingredients for “${q(i.search)}”`]
        : ["list", "ingredients"];
      break;
    case "get_ingredient": {
      const nm = ingName();
      [verb, obj] = ["read", nm ? `ingredient “${nm}”` : "an ingredient"];
      break;
    }
    case "fetch_url":
      [verb, obj] = ["fetch", hostOf(q(i.url))];
      break;
    case "web_search":
      [verb, obj] = ["search", `the web for “${q(i.query)}”`];
      break;
    case "fetch_page_summary":
      [verb, obj] = ["read", hostOf(q(i.url))];
      break;
    case "list_proposed":
      [verb, obj] = ["review", "proposed changes"];
      break;
    case "get_proposed": {
      const nm = stagedName();
      [verb, obj] = [
        "review",
        nm ? `proposed change “${nm}”` : "a proposed change",
      ];
      break;
    }
    case "create_recipe":
      [verb, obj] = ["create", `recipe “${q((i.recipe as Any)?.title)}”`];
      break;
    case "edit_recipe":
      [verb, obj] = ["edit", `recipe “${q(i.slug)}”`];
      break;
    case "create_ingredient":
      [verb, obj] = ["add", `ingredient “${q(i.name)}”`];
      break;
    case "edit_ingredient": {
      const nm = ingName();
      [verb, obj] = ["edit", nm ? `ingredient “${nm}”` : "an ingredient"];
      break;
    }
    case "edit_proposed": {
      const nm = stagedName();
      [verb, obj] = ["update", nm ? `“${nm}”` : "a proposed change"];
      break;
    }
    case "discard_proposed": {
      const nm = stagedName();
      [verb, obj] = [
        "discard",
        nm ? `proposed change “${nm}”` : "a proposed change",
      ];
      break;
    }
    default:
      return name;
  }
  const [present, past, base] = TOOL_VERBS[verb];
  if (status === "pending") return `${present} ${obj}`;
  if (status === "error") return `Failed to ${base} ${obj}`;
  return `${past} ${obj}`;
}

// ── staged-changes preview + edit ───────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  create_recipe: "New recipe",
  edit_recipe: "Edit recipe",
  create_ingredient: "New ingredient",
  edit_ingredient: "Edit ingredient",
};

/** Short display name for a staged item (its title / ingredient name). */
function stagedName(it: SerializedStagedItem): string {
  const eff = it.effective as Any;
  return String(eff.title ?? eff.name ?? "(untitled)");
}

/** Display name for a staged-diff card (from its after snapshot). */
function stagedDiffName(diff: StagedDiff): string {
  const a = diff.after as Any;
  return String(a.title ?? a.name ?? "(untitled)");
}

/** A panel that fills the right-hand drawer column (header / scroll body / footer). */
function Drawer(
  { title, onClose, footer, children }: {
    title: string;
    onClose: () => void;
    footer?: preact.ComponentChildren;
    children: preact.ComponentChildren;
  },
) {
  return (
    <div class="h-full min-h-0 flex flex-col bg-white dark:bg-stone-900">
      <div class="flex items-center justify-between px-4 py-2 border-b-2 border-stone-200 dark:border-stone-700 shrink-0">
        <h2 class="font-semibold truncate">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          icon={IconX}
          title="Close"
          onClick={onClose}
        />
      </div>
      <div class="flex-1 overflow-y-auto p-4">{children}</div>
      {footer && (
        <div class="border-t-2 border-stone-200 dark:border-stone-700 p-3 shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}

interface PreviewModalProps {
  staging: SerializedStagedItem[];
  turnActive: boolean;
  conflicts: Record<string, ConflictInfo>;
  checkedCount: number;
  applyLabel: string;
  isChecked: (id: string) => boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onRevert: (id: string) => void;
  onDiscard: (id: string) => void;
  onResolve: (id: string) => void;
  onApply: () => void;
}

function ApplyDrawer(p: PreviewModalProps) {
  return (
    <Drawer
      title={`Proposed changes (${p.staging.length})`}
      onClose={p.onClose}
      footer={
        <div class="flex items-center gap-3">
          <Button
            type="button"
            onClick={p.onApply}
            disabled={p.turnActive || p.checkedCount === 0}
          >
            {p.applyLabel}
          </Button>
          {p.turnActive && (
            <span class="text-xs text-stone-400">
              Assistant is working — editing paused.
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            class="ml-auto"
            onClick={p.onClose}
          >
            Close
          </Button>
        </div>
      }
    >
      <div class="space-y-3">
        {[...p.staging]
          // Recipes first, the more numerous/compact ingredients last.
          .sort((a, b) =>
            (a.kind.includes("ingredient") ? 1 : 0) -
            (b.kind.includes("ingredient") ? 1 : 0)
          )
          .map((it) => {
            const conflict = p.conflicts[it.id];
            const isIng = it.kind.includes("ingredient");
            const eff = it.effective as Any;

            const checkbox = !conflict && (
              <input
                type="checkbox"
                class="size-4 accent-orange-600 shrink-0"
                checked={p.isChecked(it.id)}
                disabled={p.turnActive}
                onChange={() => p.onToggle(it.id)}
              />
            );
            const actions = (
              <div class="ml-auto flex gap-1 shrink-0 items-center">
                {!conflict &&
                  (isIng
                    ? (
                      <Button
                        type="button"
                        variant="ghost"
                        icon={IconPencil}
                        title="Edit"
                        disabled={p.turnActive}
                        onClick={() => p.onEdit(it.id)}
                      />
                    )
                    : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        icon={IconPencil}
                        disabled={p.turnActive}
                        onClick={() => p.onEdit(it.id)}
                      >
                        Edit
                      </Button>
                    ))}
                {it.user_edited && (
                  <Button
                    type="button"
                    variant="ghost"
                    icon={IconArrowBackUp}
                    title="Revert to the assistant's proposal"
                    disabled={p.turnActive}
                    onClick={() => p.onRevert(it.id)}
                  />
                )}
                <Button
                  type="button"
                  variant="danger-ghost"
                  icon={IconTrash}
                  title="Discard"
                  disabled={p.turnActive}
                  onClick={() => p.onDiscard(it.id)}
                />
              </div>
            );
            const conflictBlock = conflict && (
              <div class="text-sm space-y-2">
                <p class="flex items-center gap-1 text-red-600">
                  <IconAlertTriangle class="size-4" />{" "}
                  Merge conflict — the underlying item changed since this was
                  proposed.
                </p>
                {conflict.conflict_paths.length > 0 && (
                  <p class="text-xs text-stone-500">
                    Conflicting: {conflict.conflict_paths.join(", ")}
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => p.onResolve(it.id)}
                  disabled={p.turnActive}
                >
                  Ask AI to resolve
                </Button>
              </div>
            );

            if (isIng) {
              return (
                <div
                  key={it.id}
                  class={`card p-2 space-y-2 ${
                    conflict ? "border-red-400" : ""
                  }`}
                >
                  <div class="flex items-center gap-2 text-sm">
                    {checkbox}
                    <span class="font-medium truncate">
                      {it.base_data
                        ? (
                          <DiffText
                            before={(it.base_data as Any).name}
                            after={eff.name}
                          />
                        )
                        : eff.name}
                    </span>
                    {(eff.unit || (it.base_data as Any)?.unit) && (
                      <span class="text-xs text-stone-400 shrink-0">
                        {it.base_data
                          ? (
                            <DiffText
                              before={(it.base_data as Any).unit}
                              after={eff.unit}
                            />
                          )
                          : eff.unit}
                      </span>
                    )}
                    {it.user_edited && (
                      <span class="text-xs text-orange-600 shrink-0">
                        edited
                      </span>
                    )}
                    {actions}
                  </div>
                  {conflictBlock}
                </div>
              );
            }

            return (
              <div
                key={it.id}
                class={`card space-y-2 ${conflict ? "border-red-400" : ""}`}
              >
                <div class="flex items-center gap-2">
                  {checkbox}
                  <span class="text-xs uppercase tracking-wide text-stone-500">
                    {KIND_LABEL[it.kind] ?? it.kind}
                  </span>
                  <span class="font-medium truncate">{stagedName(it)}</span>
                  {it.user_edited && (
                    <span class="text-xs text-orange-600 shrink-0">edited</span>
                  )}
                  {actions}
                </div>
                {conflict ? conflictBlock : (
                  it.base_data
                    ? (
                      <StagedItemDiff
                        before={it.base_data}
                        after={it.effective}
                        kind={it.kind}
                      />
                    )
                    : <ItemPreview item={it} />
                )}
              </div>
            );
          })}
      </div>
    </Drawer>
  );
}

/** Read-only rendered preview of a staged item. */
function ItemPreview({ item }: { item: SerializedStagedItem }) {
  const eff = item.effective as Any;
  if (
    item.kind === "create_ingredient" || item.kind === "edit_ingredient"
  ) {
    return (
      <div class="text-sm text-stone-600 dark:text-stone-300">
        <span class="font-medium">{eff.name}</span>
        {eff.unit && <span class="text-stone-400 ml-1">{`· ${eff.unit}`}</span>}
      </div>
    );
  }
  const ings: Any[] = eff.ingredients ?? [];
  const steps: Any[] = eff.steps ?? [];
  const tags = [...(eff.meal_types ?? []), ...(eff.dietary_tags ?? [])];
  const chip =
    "text-xs px-1.5 py-0.5 bg-stone-100 dark:bg-stone-800 capitalize";
  return (
    <div class="text-sm space-y-2">
      <div class="flex flex-wrap gap-1">
        {eff.quantity_value && (
          <span class={chip}>
            {eff.quantity_value} {eff.quantity_unit ?? "servings"}
          </span>
        )}
        {eff.prep_time != null && (
          <span class={chip}>prep {eff.prep_time} min</span>
        )}
        {eff.cook_time != null && (
          <span class={chip}>cook {eff.cook_time} min</span>
        )}
        {eff.rest_time != null && (
          <span class={chip}>rest {eff.rest_time} min</span>
        )}
        {eff.difficulty && <span class={chip}>{eff.difficulty}</span>}
        {tags.map((t: string) => <span key={t} class={chip}>{t}</span>)}
      </div>
      {eff.description && (
        <p class="text-stone-600 dark:text-stone-300">{eff.description}</p>
      )}
      {ings.length > 0 && (
        <div>
          <div class="text-xs font-medium text-stone-500 mb-0.5">
            Ingredients
          </div>
          <ul class="list-disc pl-5 space-y-0.5">
            {ings.map((g, i) => (
              <li key={i}>
                {[g.amount, g.unit, g.name].filter(Boolean).join(" ")}
                {!g.ingredient_id && (
                  <span class="text-red-500 text-xs ml-1">(unlinked)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {steps.length > 0 && (
        <div>
          <div class="text-xs font-medium text-stone-500 mb-0.5">Steps</div>
          <ol class="list-decimal pl-5 space-y-1">
            {steps.map((s, i) => (
              <li key={i}>
                {s.title && <span class="font-medium">{s.title}:</span>}
                {s.title ? " " : ""}
                {s.body}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── staged-item diff view ───────────────────────────────────────────

type DiffState = "added" | "removed" | "changed" | "same";

const DIFF_HL: Record<DiffState, string> = {
  added: "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300",
  removed:
    "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 line-through",
  changed:
    "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300",
  same: "",
};

function isEmptyVal(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

function diffState(before: unknown, after: unknown): DiffState {
  const be = isEmptyVal(before);
  const ae = isEmptyVal(after);
  if (be && ae) return "same";
  if (be) return "added";
  if (ae) return "removed";
  return JSON.stringify(before) === JSON.stringify(after) ? "same" : "changed";
}

const fmtVal = (v: unknown): string =>
  v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);

// Split into words and the whitespace between them, so a word-level diff can
// rejoin them without losing spacing.
function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t !== "");
}

interface TextSeg {
  type: "same" | "add" | "del";
  text: string;
}

/** Word-level diff of two strings via a longest-common-subsequence walk. */
function diffTokens(a: string[], b: string[]): TextSeg[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from(
    { length: n + 1 },
    () => new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: TextSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) raw.push({ type: "same", text: a[i++] }), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "del", text: a[i++] });
    } else raw.push({ type: "add", text: b[j++] });
  }
  while (i < n) raw.push({ type: "del", text: a[i++] });
  while (j < m) raw.push({ type: "add", text: b[j++] });
  // Coalesce runs of the same type for fewer spans.
  const out: TextSeg[] = [];
  for (const seg of raw) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

/** Inline word diff: unchanged plain, removed red+strike, added green. */
function TextDiff({ before, after }: { before: string; after: string }) {
  const a = tokenize(before);
  const b = tokenize(after);
  // Guard against pathological inputs — fall back to whole-value old → new.
  if (a.length > 600 || b.length > 600) {
    return (
      <span>
        <span class={`${DIFF_HL.removed} px-1`}>{before}</span>{" "}
        <span class={`${DIFF_HL.changed} px-1`}>{after}</span>
      </span>
    );
  }
  return (
    <span>
      {diffTokens(a, b).map((seg, i) =>
        seg.type === "same" ? <span key={i}>{seg.text}</span> : (
          <span
            key={i}
            class={seg.type === "add" ? DIFF_HL.added : DIFF_HL.removed}
          >
            {seg.text}
          </span>
        )
      )}
    </span>
  );
}

/** A single value, highlighted by how it changed (green/yellow/red+strike). */
function DiffText(
  { before, after, fmt = fmtVal }: {
    before: unknown;
    after: unknown;
    fmt?: (v: unknown) => string;
  },
) {
  const s = diffState(before, after);
  if (s === "same") return <span>{fmt(after)}</span>;
  if (s === "added") {
    return <span class={`${DIFF_HL.added} px-1`}>{fmt(after)}</span>;
  }
  if (s === "removed") {
    return <span class={`${DIFF_HL.removed} px-1`}>{fmt(before)}</span>;
  }
  return <TextDiff before={fmt(before)} after={fmt(after)} />;
}

/** A labeled field row, omitted in compact mode when unchanged. */
function DiffRow(
  { label, before, after, fmt, compact }: {
    label: string;
    before: unknown;
    after: unknown;
    fmt?: (v: unknown) => string;
    compact?: boolean;
  },
) {
  const s = diffState(before, after);
  if (compact && s === "same") return null;
  if (s === "same" && isEmptyVal(after)) return null;
  return (
    <div class="flex gap-2">
      <span class="text-xs text-stone-500 w-24 shrink-0 pt-0.5">{label}</span>
      <div class="min-w-0 flex-1 whitespace-pre-wrap">
        <DiffText before={before} after={after} fmt={fmt} />
      </div>
    </div>
  );
}

/**
 * Diff of a staged recipe/ingredient: renders the item with added green,
 * changed yellow, and removed red + strikethrough, comparing `before` (the
 * item's previous version) to `after`. `compact` (used in the chat) shows only
 * what changed.
 */
function StagedItemDiff(
  { before, after, kind, compact }: {
    before: Any;
    after: Any;
    kind: string;
    compact?: boolean;
  },
) {
  const b = (before ?? {}) as Any;
  const a = (after ?? {}) as Any;

  if (kind.includes("ingredient")) {
    return (
      <div class="text-sm space-y-1">
        <DiffRow
          label="Name"
          before={b.name}
          after={a.name}
          compact={compact}
        />
        <DiffRow
          label="Unit"
          before={b.unit}
          after={a.unit}
          compact={compact}
        />
      </div>
    );
  }

  const minFmt = (v: unknown) => isEmptyVal(v) ? "" : `${v} min`;
  const qtyOf = (o: Any) =>
    o.quantity_value
      ? `${o.quantity_value} ${o.quantity_unit ?? "servings"}`
      : "";

  const ingText = (g: Any) =>
    [g.amount, g.unit, g.name].filter(Boolean).join(" ");
  const stepText = (s: Any) =>
    [s.title ? `${s.title}:` : "", s.body].filter(Boolean).join(" ");
  // The ingredient_id link isn't in the display text, so include it in the diff
  // signal — otherwise linking an ingredient reads as "no change".
  const ingSig = (g: Any) => `${ingText(g)} ${g.ingredient_id ?? ""}`;

  // Collections are diffed by stable key (ingredient key, step id), never index.
  // `sig` (defaults to `text`) is the value used to detect a change.
  const collDiff = (
    bs: Any[],
    as: Any[],
    keyOf: (x: Any) => string,
    text: (x: Any) => string,
    sig: (x: Any) => string = text,
  ) => {
    const bm = new Map((bs ?? []).map((x) => [keyOf(x), x]));
    const am = new Map((as ?? []).map((x) => [keyOf(x), x]));
    const keys = [
      ...am.keys(),
      ...[...bm.keys()].filter((k) => !am.has(k)),
    ];
    return keys
      .map((k) => {
        const bv = bm.get(k);
        const av = am.get(k);
        const s = diffState(bv ? sig(bv) : "", av ? sig(av) : "");
        return { k, bv, av, s };
      })
      .filter((r) => !compact || r.s !== "same");
  };

  const ings = collDiff(
    b.ingredients,
    a.ingredients,
    (g) => g.key ?? g.name ?? "",
    ingText,
    ingSig,
  );
  const steps = collDiff(
    b.steps,
    a.steps,
    (s) => s.id ?? "",
    stepText,
  );

  return (
    <div class="text-sm space-y-2">
      <DiffRow
        label="Title"
        before={b.title}
        after={a.title}
        compact={compact}
      />
      <DiffRow
        label="Description"
        before={b.description}
        after={a.description}
        compact={compact}
      />
      <DiffRow
        label="Quantity"
        before={qtyOf(b)}
        after={qtyOf(a)}
        compact={compact}
      />
      <DiffRow
        label="Prep"
        before={b.prep_time}
        after={a.prep_time}
        fmt={minFmt}
        compact={compact}
      />
      <DiffRow
        label="Cook"
        before={b.cook_time}
        after={a.cook_time}
        fmt={minFmt}
        compact={compact}
      />
      <DiffRow
        label="Rest"
        before={b.rest_time}
        after={a.rest_time}
        fmt={minFmt}
        compact={compact}
      />
      <DiffRow
        label="Difficulty"
        before={b.difficulty}
        after={a.difficulty}
        compact={compact}
      />
      <DiffRow
        label="Meal types"
        before={b.meal_types}
        after={a.meal_types}
        compact={compact}
      />
      <DiffRow
        label="Dietary"
        before={b.dietary_tags}
        after={a.dietary_tags}
        compact={compact}
      />
      <DiffRow
        label="Source"
        before={b.source_name}
        after={a.source_name}
        compact={compact}
      />
      {ings.length > 0 && (
        <div>
          <div class="text-xs font-medium text-stone-500 mb-0.5">
            Ingredients
          </div>
          <ul class="list-disc pl-5 space-y-0.5">
            {ings.map((r) => (
              <li
                key={r.k}
                class={r.s === "added" || r.s === "removed"
                  ? `${DIFF_HL[r.s]} px-1`
                  : ""}
              >
                {r.s === "changed"
                  ? <TextDiff before={ingText(r.bv)} after={ingText(r.av)} />
                  : ingText(r.s === "removed" ? r.bv : (r.av ?? r.bv))}
                {r.s === "changed" &&
                  r.bv?.ingredient_id !== r.av?.ingredient_id &&
                  (
                    <span
                      class={`text-xs ml-1 px-1 ${
                        r.av?.ingredient_id ? DIFF_HL.added : DIFF_HL.removed
                      }`}
                    >
                      {r.av?.ingredient_id ? "linked" : "unlinked"}
                    </span>
                  )}
                {r.s !== "changed" && r.av && !r.av.ingredient_id && (
                  <span class="text-red-500 text-xs ml-1">(unlinked)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {steps.length > 0 && (
        <div>
          <div class="text-xs font-medium text-stone-500 mb-0.5">Steps</div>
          <ol class="list-decimal pl-5 space-y-1">
            {steps.map((r) => (
              <li
                key={r.k}
                class={r.s === "added" || r.s === "removed"
                  ? `${DIFF_HL[r.s]} px-1`
                  : ""}
              >
                {r.s === "changed"
                  ? <TextDiff before={stepText(r.bv)} after={stepText(r.av)} />
                  : stepText(r.s === "removed" ? r.bv : (r.av ?? r.bv))}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

interface EditItemModalProps {
  item: SerializedStagedItem;
  ingredients: IngredientOption[];
  allTools: { id: string; name: string }[];
  allRecipes: { id: string; title: string }[];
  onCancel: () => void;
  onSave: (data: Record<string, unknown>) => void | Promise<void>;
}

function EditDrawer(p: EditItemModalProps) {
  const { item, onCancel, onSave } = p;
  const isIngredient = item.kind === "create_ingredient" ||
    item.kind === "edit_ingredient";
  // Ingredients use the small controlled editor; recipes use the real recipe
  // edit form (RecipeFields) read via FormData on save.
  const [data, setData] = useState<Any>(structuredClone(item.effective));
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function save() {
    setSaving(true);
    if (isIngredient) {
      await onSave(data);
      return;
    }
    const form = formRef.current;
    if (!form) return;
    const converted = formDataToRecipeData(new FormData(form));
    const eff = item.effective as Any;
    // Preserve fields the form doesn't round-trip (tools, sub-recipe refs) and
    // keep the existing cover when the form has no cover field.
    const merged: Record<string, unknown> = {
      ...structuredClone(eff),
      ...converted,
      cover_image_id: (converted.cover_image_id as string) ??
        eff.cover_image_id ?? null,
    };
    await onSave(merged);
  }

  return (
    <Drawer
      title={`Edit — ${KIND_LABEL[item.kind] ?? item.kind}`}
      onClose={onCancel}
      footer={
        <div class="flex gap-2">
          <Button type="button" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      }
    >
      {isIngredient
        ? <IngredientEditor data={data} setData={setData} disabled={false} />
        : (
          <form ref={formRef}>
            <RecipeFields
              r={item.effective}
              showCover={false}
              ingredients={p.ingredients}
              allTools={p.allTools}
              allRecipes={p.allRecipes}
            />
          </form>
        )}
    </Drawer>
  );
}

function UnitDropdown(
  { value, disabled, onChange, class: cls }: {
    value: string;
    disabled: boolean;
    onChange: (v: string) => void;
    class?: string;
  },
) {
  return (
    <Select
      class={cls ?? "w-full"}
      size="sm"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      <option value="">unit</option>
      {UNIT_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.units.map((u) => (
            <option key={u.name} value={u.name}>{u.name}</option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

function Field(
  { label, children }: { label: string; children: preact.ComponentChildren },
) {
  return (
    <div>
      <label class="block text-xs font-medium mb-1 text-stone-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function IngredientEditor(
  { data, setData, disabled }: {
    data: Any;
    setData: (d: Any) => void;
    disabled: boolean;
  },
) {
  const set = (k: string, v: unknown) => setData({ ...data, [k]: v });
  return (
    <div class="grid grid-cols-2 gap-2">
      <Field label="Name">
        <Input
          class="w-full"
          value={data.name ?? ""}
          disabled={disabled}
          onValueChange={(v) => set("name", v)}
        />
      </Field>
      <Field label="Unit">
        <UnitDropdown
          value={data.unit ?? ""}
          disabled={disabled}
          onChange={(v) => set("unit", v || null)}
        />
      </Field>
    </div>
  );
}
