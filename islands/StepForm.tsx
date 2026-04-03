import { useSignal } from "@preact/signals";
import TbArrowUp from "tb-icons/TbArrowUp";
import TbArrowDown from "tb-icons/TbArrowDown";
import TbPlus from "tb-icons/TbPlus";
import TbTrash from "tb-icons/TbTrash";
import TbUpload from "tb-icons/TbUpload";
import TbX from "tb-icons/TbX";

interface MediaItem {
  id: string;
  url: string;
}

interface StepEntry {
  title: string;
  body: string;
  media: MediaItem[];
  after: number[];
}

import type { Signal } from "@preact/signals";

interface StepFormProps {
  initialSteps: StepEntry[];
  mode: Signal<"list" | "graph">;
}

function computeColumns(steps: StepEntry[]): number[] {
  const cols = new Array(steps.length).fill(-1);
  function resolve(i: number): number {
    if (cols[i] >= 0) return cols[i];
    cols[i] = 0;
    if (steps[i].after.length === 0) return 0;
    let max = 0;
    for (const dep of steps[i].after) {
      if (dep >= 0 && dep < steps.length) {
        max = Math.max(max, resolve(dep) + 1);
      }
    }
    cols[i] = max;
    return max;
  }
  for (let i = 0; i < steps.length; i++) resolve(i);
  return cols;
}

function isLinearChain(steps: StepEntry[]): boolean {
  for (let i = 0; i < steps.length; i++) {
    if (i === 0) {
      if (steps[i].after.length > 0) return false;
    } else {
      if (steps[i].after.length !== 1 || steps[i].after[0] !== i - 1) return false;
    }
  }
  return true;
}

function toLinearChain(steps: StepEntry[]): StepEntry[] {
  return steps.map((s, i) => ({ ...s, after: i === 0 ? [] : [i - 1] }));
}

function reindexSteps(steps: StepEntry[], selectedIdx: number | null) {
  const c = computeColumns(steps);
  const order = steps.map((_, i) => i);
  order.sort((a, b) => c[a] - c[b] || a - b);
  const remap = new Map<number, number>();
  order.forEach((oldIdx, newIdx) => remap.set(oldIdx, newIdx));
  const sorted = order.map((oldIdx) => ({
    ...steps[oldIdx],
    after: steps[oldIdx].after.map((a) => remap.get(a)!).sort((a, b) => a - b),
  }));
  return {
    steps: sorted,
    selected: selectedIdx != null ? (remap.get(selectedIdx) ?? null) : null,
  };
}

// Layout constants
const COL_WIDTH = 194;
const ROW_HEIGHT = 76;
const CARD_W = 170;
const CARD_H = 52;
const COL_GAP = COL_WIDTH - CARD_W;
const ROW_GAP = ROW_HEIGHT - CARD_H;

export default function StepForm({ initialSteps, mode }: StepFormProps) {
  const items = useSignal<StepEntry[]>(
    initialSteps.length > 0
      ? [...initialSteps]
      : [{ title: "", body: "", media: [], after: [] }],
  );
  const selected = useSignal<number | null>(null);
  const uploading = useSignal<number | null>(null);
  // Snapshot of graph deps before switching to list mode, so we can restore
  const savedGraphDeps = useSignal<number[][] | null>(null);

  // Drag-to-connect state
  const dragFrom = useSignal<number | null>(null);
  const dragPos = useSignal<{ x: number; y: number } | null>(null);

  // ── Shared helpers ──

  function updateField(index: number, field: "title" | "body", value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };
    items.value = next;
  }

  async function uploadMedia(stepIndex: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    uploading.value = stepIndex;
    const next = [...items.value];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) continue;
        const data = await res.json();
        next[stepIndex] = {
          ...next[stepIndex],
          media: [...next[stepIndex].media, { id: String(data.id), url: String(data.url) }],
        };
      } catch { /* skip */ }
    }
    items.value = next;
    uploading.value = null;
  }

  function removeMedia(stepIndex: number, mediaIndex: number) {
    const next = [...items.value];
    const item = next[stepIndex];
    fetch(`/api/media/${item.media[mediaIndex].id}`, { method: "DELETE" }).catch(() => {});
    next[stepIndex] = { ...item, media: item.media.filter((_, i) => i !== mediaIndex) };
    items.value = next;
  }

  // ── Graph helpers ──

  function graphInsertAfter(depIndex: number) {
    const newIdx = items.value.length;
    const rewired = items.value.map((s) => ({
      ...s,
      after: s.after.map((a) => (a === depIndex ? newIdx : a)),
    }));
    const next = [...rewired, { title: "", body: "", media: [], after: [depIndex] }];
    const r = reindexSteps(next, newIdx);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function graphBranchAfter(depIndex: number) {
    const newIdx = items.value.length;
    const next = [...items.value, { title: "", body: "", media: [], after: [depIndex] }];
    const r = reindexSteps(next, newIdx);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function graphAddStart() {
    const newIdx = items.value.length;
    const next = [...items.value, { title: "", body: "", media: [], after: [] }];
    const r = reindexSteps(next, newIdx);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function graphRemoveStep(index: number) {
    const newSel = selected.value === index ? null
      : selected.value != null && selected.value > index ? selected.value - 1
      : selected.value;

    // The deleted step's own dependencies — these get inherited by its dependents
    const deletedDeps = items.value[index].after;

    const next = items.value.filter((_, i) => i !== index).map((s) => {
      let after = s.after;
      if (after.includes(index)) {
        // Replace dep on deleted step with deleted step's own deps (bridge the gap)
        after = [
          ...after.filter((a) => a !== index),
          ...deletedDeps,
        ];
        // Deduplicate
        after = [...new Set(after)];
      }
      // Remap indices for the removed element
      after = after.map((a) => (a > index ? a - 1 : a));
      return { ...s, after: after.sort((a, b) => a - b) };
    });

    if (next.length === 0) {
      items.value = [{ title: "", body: "", media: [], after: [] }];
      selected.value = null;
      return;
    }
    const r = reindexSteps(next, newSel);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function addDep(stepIndex: number, depIndex: number) {
    if (stepIndex === depIndex) return;
    const step = items.value[stepIndex];
    if (step.after.includes(depIndex)) return;
    const next = [...items.value];
    next[stepIndex] = { ...step, after: [...step.after, depIndex].sort((a, b) => a - b) };
    const r = reindexSteps(next, selected.value);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function removeDep(stepIndex: number, depIndex: number) {
    const step = items.value[stepIndex];
    const next = [...items.value];
    next[stepIndex] = { ...step, after: step.after.filter((a) => a !== depIndex) };
    const r = reindexSteps(next, selected.value);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function stepLabel(index: number): string {
    const t = items.value[index]?.title?.trim();
    return t || `Step ${index + 1}`;
  }

  // ── Render ──

  // Save graph deps when switching to list, restore when switching back
  if (mode.value === "list" && !isLinearChain(items.value)) {
    savedGraphDeps.value = items.value.map((s) => [...s.after]);
    items.value = toLinearChain(items.value);
    selected.value = null;
  } else if (mode.value === "graph" && savedGraphDeps.value != null) {
    // Restore graph deps (only if step count hasn't changed)
    if (savedGraphDeps.value.length === items.value.length) {
      items.value = items.value.map((s, i) => ({ ...s, after: savedGraphDeps.value![i] }));
    }
    savedGraphDeps.value = null;
  }

  const steps = items.value;
  const sel = selected.value;
  const selStep = sel != null ? steps[sel] : null;
  const isGraph = mode.value === "graph";

  const cols = computeColumns(steps);
  const maxCol = Math.max(0, ...cols);

  // Vertical positioning
  const colCounts: number[] = new Array(maxCol + 1).fill(0);
  for (const c of cols) if (c >= 0) colCounts[c]++;
  const maxRows = Math.max(1, ...colCounts);
  const svgW = (maxCol + 1) * COL_WIDTH;
  const svgH = maxRows * ROW_HEIGHT;
  const containerH = svgH + ROW_HEIGHT; // extra space for "add step" card

  // stepY: vertical center (px) of each step's card. Computed column-by-column
  // so later columns can sort by their deps' Y positions. Columns are centered.
  const stepY = new Map<number, number>();
  const colSorted = new Map<number, number[]>();

  for (let c = 0; c <= maxCol; c++) {
    const inCol: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (cols[i] === c) inCol.push(i);
    }
    if (c > 0) {
      inCol.sort((a, b) => {
        const aAvg = steps[a].after.length > 0
          ? steps[a].after.reduce((s, d) => s + (stepY.get(d) ?? 0), 0) / steps[a].after.length
          : 0;
        const bAvg = steps[b].after.length > 0
          ? steps[b].after.reduce((s, d) => s + (stepY.get(d) ?? 0), 0) / steps[b].after.length
          : 0;
        return aAvg - bAvg;
      });
    }
    colSorted.set(c, inCol);
    const colH = inCol.length * ROW_HEIGHT;
    const offsetY = (svgH - colH) / 2;
    inCol.forEach((idx, row) => {
      stepY.set(idx, offsetY + row * ROW_HEIGHT + CARD_H / 2);
    });
  }

  // Find leaf nodes (steps that no other step depends on)
  const hasDependent = new Set<number>();
  for (const step of steps) {
    for (const dep of step.after) hasDependent.add(dep);
  }
  const leafNodes = steps.map((_, i) => i).filter((i) => !hasDependent.has(i));

  function cardRight(index: number) {
    return { x: cols[index] * COL_WIDTH + CARD_W, y: stepY.get(index) ?? 0 };
  }
  function cardLeft(index: number) {
    return { x: cols[index] * COL_WIDTH, y: stepY.get(index) ?? 0 };
  }

  // SVG edge paths
  const svgEdges: { d: string; active: boolean; key: string; fromIdx: number; toIdx: number }[] = [];
  for (let i = 0; i < steps.length; i++) {
    for (const dep of steps[i].after) {
      const p1 = cardRight(dep);
      const p2 = cardLeft(i);
      const dx = Math.abs(p2.x - p1.x) * 0.5;
      const d = `M${p1.x},${p1.y} C${p1.x + dx},${p1.y} ${p2.x - dx},${p2.y} ${p2.x},${p2.y}`;
      const active = sel != null && (sel === i || sel === dep);
      svgEdges.push({ d, active, key: `${dep}-${i}`, fromIdx: dep, toIdx: i });
    }
  }

  function getStepsInCol(col: number) {
    return (colSorted.get(col) ?? []).map((i) => ({ index: i, step: steps[i] }));
  }

  const selDeps = new Set(selStep?.after ?? []);
  const selDependents = new Set<number>();
  if (sel != null) {
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].after.includes(sel)) selDependents.add(i);
    }
  }

  // Drag handlers
  function onDragHandleMouseDown(index: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragFrom.value = index;

    const container = (e.target as HTMLElement).closest("[data-graph-container]") as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    dragPos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (me: MouseEvent) => {
      dragPos.value = { x: me.clientX - rect.left, y: me.clientY - rect.top };
    };

    const onUp = (ue: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      // Find which card we dropped on
      const target = document.elementFromPoint(ue.clientX, ue.clientY);
      const cardEl = target?.closest("[data-step-idx]") as HTMLElement | null;
      if (cardEl && dragFrom.value != null) {
        const toIdx = parseInt(cardEl.dataset.stepIdx!);
        if (!isNaN(toIdx) && toIdx !== dragFrom.value) {
          // from → to means "toIdx depends on fromIdx"
          addDep(toIdx, dragFrom.value);
        }
      }

      dragFrom.value = null;
      dragPos.value = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Live drag line
  const dragLine = (() => {
    if (dragFrom.value == null || !dragPos.value) return null;
    const p1 = cardRight(dragFrom.value);
    const p2 = dragPos.value;
    const dx = Math.abs(p2.x - p1.x) * 0.4;
    return `M${p1.x},${p1.y} C${p1.x + dx},${p1.y} ${p2.x - dx},${p2.y} ${p2.x},${p2.y}`;
  })();

  return (
    <div class="mt-4">
      {/* ── List mode ── */}
      {!isGraph && (
        <div class="space-y-4">
          {steps.map((item, i) => (
            <div key={i} class="card p-3 space-y-2">
              <div class="flex flex-wrap sm:flex-nowrap gap-2 items-center min-w-0">
                <span class="text-xs text-stone-400 font-mono shrink-0 max-sm:order-1">#{i + 1}</span>
                <input
                  type="text"
                  placeholder="Step title"
                  value={item.title}
                  onInput={(e) => updateField(i, "title", (e.target as HTMLInputElement).value)}
                  class="flex-1 min-w-0 text-sm font-medium max-sm:order-3 max-sm:basis-full"
                />
                <div class="flex items-center gap-1 shrink-0 max-sm:order-2 max-sm:ml-auto">
                  <button type="button" onClick={() => { const t = i - 1; if (t < 0) return; const n = [...items.value]; [n[i], n[t]] = [n[t], n[i]]; items.value = toLinearChain(n); }} disabled={i === 0} class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"><TbArrowUp class="size-4" /></button>
                  <button type="button" onClick={() => { const t = i + 1; if (t >= items.value.length) return; const n = [...items.value]; [n[i], n[t]] = [n[t], n[i]]; items.value = toLinearChain(n); }} disabled={i === items.value.length - 1} class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"><TbArrowDown class="size-4" /></button>
                  <button type="button" onClick={() => { items.value = toLinearChain(items.value.filter((_, j) => j !== i)); }} class="text-red-600 hover:text-red-700 p-1 cursor-pointer"><TbTrash class="size-4" /></button>
                </div>
              </div>
              <textarea
                placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
                value={item.body}
                onInput={(e) => updateField(i, "body", (e.target as HTMLTextAreaElement).value)}
                rows={6}
                class="w-full text-sm font-mono"
              />
              {item.media.length > 0 && (
                <div class="flex flex-wrap gap-2">
                  {item.media.map((m, mi) => (
                    <div key={m.id} class="relative group">
                      <img src={m.url} alt="" class="w-20 h-20 object-cover border-2 border-stone-300 dark:border-stone-700" />
                      <button type="button" onClick={() => removeMedia(i, mi)} class="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><TbX class="size-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                class="link text-xs"
                onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.onchange = () => uploadMedia(i, input.files); input.click(); }}
              >
                {uploading.value === i ? "Uploading..." : <span><TbUpload class="size-3 inline mr-0.5" />Add images</span>}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => { const prev = items.value.length - 1; items.value = [...items.value, { title: "", body: "", media: [], after: prev >= 0 ? [prev] : [] }]; }}
            class="link text-sm font-medium"
          >
            <TbPlus class="size-3.5 inline mr-1" />Add Step
          </button>
        </div>
      )}

      {/* ── Graph mode ── */}
      {isGraph && (
        <div class="space-y-4">
          <div class="overflow-x-auto pb-2">
            <div data-graph-container style={{ position: "relative", width: `${svgW}px`, minHeight: `${containerH}px` }}>
              {/* Cards — absolutely positioned to match SVG coordinates */}
              <div style={{ position: "relative", zIndex: 2 }}>
                {steps.map((step, index) => {
                  const y = (stepY.get(index) ?? 0) - CARD_H / 2;
                  const x = cols[index] * COL_WIDTH;
                  const isSelected = sel === index;
                  const isDep = selDeps.has(index);
                  const isDependent = selDependents.has(index);
                  const isDragSource = dragFrom.value === index;
                  return (
                    <div
                      key={index}
                      data-step-idx={index}
                      style={{ position: "absolute", left: `${x}px`, top: `${y}px`, width: `${CARD_W}px`, height: `${CARD_H}px` }}
                      class={`p-2 border-2 cursor-pointer transition-colors text-sm bg-white dark:bg-stone-900 ${
                            isDragSource
                              ? "border-orange-400 ring-2 ring-orange-200 dark:ring-orange-800"
                              : isSelected
                              ? "border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800"
                              : isDep ? "border-green-400 dark:border-green-600"
                              : isDependent ? "border-blue-300 dark:border-blue-700"
                              : "border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600"
                          }`}
                          onClick={() => { selected.value = isSelected ? null : index; }}
                        >
                          <div class="flex items-center justify-between gap-1">
                            <div class="min-w-0 flex-1 flex items-center gap-1.5">
                              <span class="text-xs text-stone-400 font-mono shrink-0">#{index + 1}</span>
                              <span class="font-medium truncate">{step.title.trim() || <span class="text-stone-400 italic">untitled</span>}</span>
                            </div>
                            <div class="flex items-center shrink-0">
                              <button type="button" title="Insert step in sequence" class="text-stone-400 hover:text-orange-600 p-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); graphInsertAfter(index); }}><TbPlus class="size-3.5" /></button>
                              <button type="button" title="Add parallel branch" class="text-stone-400 hover:text-blue-600 p-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); graphBranchAfter(index); }}><TbPlus class="size-3.5" style={{ transform: "rotate(45deg)" }} /></button>
                              <button type="button" class="text-stone-400 hover:text-red-600 p-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); graphRemoveStep(index); }}><TbTrash class="size-3.5" /></button>
                            </div>
                          </div>

                          {/* Drag handle — right edge dot */}
                          <div
                            class="absolute top-1/2 -right-2.5 w-5 h-5 -mt-2.5 flex items-center justify-center cursor-crosshair"
                            onMouseDown={(e) => onDragHandleMouseDown(index, e as unknown as MouseEvent)}
                          >
                            <div class="w-2.5 h-2.5 rounded-full bg-stone-300 dark:bg-stone-600 hover:bg-orange-400 dark:hover:bg-orange-500 transition-colors" />
                          </div>
                    </div>
                  );
                })}

                {/* Add starting step — dashed card below column 0 */}
                {(() => {
                  const col0 = colSorted.get(0) ?? [];
                  const lastInCol0 = col0.length > 0 ? col0[col0.length - 1] : -1;
                  const y = lastInCol0 >= 0
                    ? (stepY.get(lastInCol0) ?? 0) + CARD_H / 2 + ROW_GAP
                    : 0;
                  return (
                    <div
                      style={{ position: "absolute", left: 0, top: `${y}px`, width: `${CARD_W}px`, height: `${CARD_H}px` }}
                      class="border-2 border-dashed border-stone-300 dark:border-stone-600 hover:border-stone-400 dark:hover:border-stone-500 cursor-pointer transition-colors flex items-center justify-center text-stone-400 hover:text-stone-600 text-xs"
                      onClick={() => graphAddStart()}
                    >
                      <TbPlus class="size-3.5 mr-1" />Add starting step
                    </div>
                  );
                })()}
              </div>

              {/* SVG edges + drag line */}
              <svg style={{ position: "absolute", top: 0, left: 0, zIndex: 1, pointerEvents: "none", overflow: "visible" }} width={svgW} height={svgH}>
                {svgEdges.map(({ d, active, key, fromIdx, toIdx }) => (
                  <g key={key}>
                    {/* Invisible thick hit area */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      stroke-width={12}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onClick={() => removeDep(toIdx, fromIdx)}
                    />
                    {/* Visible line */}
                    <path
                      d={d}
                      fill="none"
                      stroke={active ? "#f97316" : "#a8a29e"}
                      stroke-width={active ? 2.5 : 1.5}
                      opacity={active ? 1 : 0.4}
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                ))}
                {/* Live drag line */}
                {dragLine && (
                  <path
                    d={dragLine}
                    fill="none"
                    stroke="#f97316"
                    stroke-width={2}
                    stroke-dasharray="6 4"
                    opacity={0.7}
                  />
                )}
              </svg>
            </div>
          </div>


          {/* Legend */}
          {sel != null && (
            <div class="flex flex-wrap gap-3 text-xs text-stone-500">
              <span><span class="inline-block w-3 h-3 border-2 border-orange-500 mr-1 align-middle" />selected</span>
              <span><span class="inline-block w-3 h-3 border-2 border-green-400 mr-1 align-middle" />dependency</span>
              <span><span class="inline-block w-3 h-3 border-2 border-blue-300 mr-1 align-middle" />depends on selected</span>
            </div>
          )}

          {/* Validation: single end node */}
          {leafNodes.length > 1 && (
            <div class="text-xs text-red-600 dark:text-red-400 border-2 border-red-300 dark:border-red-700 p-2">
              Recipe must have a single final step. Currently {leafNodes.length} steps have nothing after them: {leafNodes.map((i) => `#${i + 1} ${steps[i].title.trim() || "untitled"}`).join(", ")}. Connect them or remove extras.
            </div>
          )}

          {/* Editor panel */}
          {sel != null && selStep && (
            <div class="card p-4 space-y-3 border-orange-300 dark:border-orange-700 border-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-stone-500">Step {sel + 1}</span>
                <button type="button" onClick={() => { selected.value = null; }} class="text-stone-400 hover:text-stone-600 ml-auto cursor-pointer"><TbX class="size-4" /></button>
              </div>
              <input
                type="text"
                placeholder="Step title"
                value={selStep.title}
                onInput={(e) => updateField(sel, "title", (e.target as HTMLInputElement).value)}
                class="w-full text-sm font-medium"
              />
              <textarea
                placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
                value={selStep.body}
                onInput={(e) => updateField(sel, "body", (e.target as HTMLTextAreaElement).value)}
                rows={6}
                class="w-full text-sm font-mono"
              />
              {selStep.media.length > 0 && (
                <div class="flex flex-wrap gap-2">
                  {selStep.media.map((m, mi) => (
                    <div key={m.id} class="relative group">
                      <img src={m.url} alt="" class="w-20 h-20 object-cover border-2 border-stone-300 dark:border-stone-700" />
                      <button type="button" onClick={() => removeMedia(sel, mi)} class="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><TbX class="size-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                class="link text-xs"
                onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.onchange = () => uploadMedia(sel, input.files); input.click(); }}
              >
                {uploading.value === sel ? "Uploading..." : <span><TbUpload class="size-3 inline mr-0.5" />Add images</span>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hidden form fields */}
      {steps.map((step, i) => (
        <div key={`hidden-${i}`}>
          <input type="hidden" name={`steps[${i}][title]`} value={step.title} />
          <input type="hidden" name={`steps[${i}][body]`} value={step.body} />
          <input type="hidden" name={`steps[${i}][after]`} value={step.after.join(",")} />
          {step.media.map((m, mi) => (
            <input key={m.id} type="hidden" name={`steps[${i}][media][${mi}]`} value={m.id} />
          ))}
        </div>
      ))}
    </div>
  );
}
