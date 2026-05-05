import { useSignal } from "@preact/signals";
import TbArrowUp from "tb-icons/TbArrowUp";
import TbArrowDown from "tb-icons/TbArrowDown";
import TbPlus from "tb-icons/TbPlus";
import TbTrash from "tb-icons/TbTrash";
import TbUpload from "tb-icons/TbUpload";
import TbX from "tb-icons/TbX";
import { slugify } from "../utils.ts";

interface MediaItem {
  id: string;
  url: string;
}

interface StepEntry {
  title: string;
  body: string;
  media: MediaItem[];
  after: number[];
  /** Index into the sections array, or null for "no section". */
  section: number | null;
  _uid?: string;
}

interface SectionEntry {
  title: string;
  /** Auto-derived from title unless user edits it manually. */
  key: string;
  /** True once the user has manually edited the key — stops auto-derive. */
  keyDirty: boolean;
  /** Indices of sections this one depends on (must complete first). */
  after: number[];
  _uid?: string;
}

function newStep(partial: Partial<StepEntry> = {}): StepEntry {
  return {
    title: "",
    body: "",
    media: [],
    after: [],
    section: null,
    ...partial,
    _uid: crypto.randomUUID(),
  };
}

function newSection(partial: Partial<SectionEntry> = {}): SectionEntry {
  return {
    title: "",
    key: "",
    keyDirty: false,
    after: [],
    ...partial,
    _uid: crypto.randomUUID(),
  };
}

import type { Signal } from "@preact/signals";

interface InitialSection {
  title: string;
  key: string;
  after?: number[];
}

interface InitialStep {
  title: string;
  body: string;
  media: MediaItem[];
  after: number[];
  section?: number | null;
}

interface StepFormProps {
  initialSteps: InitialStep[];
  initialSections?: InitialSection[];
  mode: Signal<"list" | "graph">;
}

// ── Pure helpers ──

function computeColumns(items: { after: number[] }[]): number[] {
  const cols = new Array(items.length).fill(-1);
  function resolve(i: number): number {
    if (cols[i] >= 0) return cols[i];
    cols[i] = 0;
    for (const dep of items[i].after) {
      if (dep >= 0 && dep < items.length) {
        cols[i] = Math.max(cols[i], resolve(dep) + 1);
      }
    }
    return cols[i];
  }
  for (let i = 0; i < items.length; i++) resolve(i);
  return cols;
}

function isLinearChain(steps: StepEntry[]): boolean {
  return steps.every((s, i) =>
    i === 0
      ? s.after.length === 0
      : s.after.length === 1 && s.after[0] === i - 1
  );
}

function toLinearChain(steps: StepEntry[]): StepEntry[] {
  return steps.map((s, i) => ({ ...s, after: i === 0 ? [] : [i - 1] }));
}

function isLinearSectionChain(secs: SectionEntry[]): boolean {
  return secs.every((s, i) =>
    i === 0
      ? s.after.length === 0
      : s.after.length === 1 && s.after[0] === i - 1
  );
}

function toLinearSectionChain(secs: SectionEntry[]): SectionEntry[] {
  return secs.map((s, i) => ({ ...s, after: i === 0 ? [] : [i - 1] }));
}

function reindexSteps(steps: StepEntry[], selectedIdx: number | null) {
  const cols = computeColumns(steps);
  const order = steps.map((_, i) => i);
  order.sort((a, b) => cols[a] - cols[b] || a - b);
  const remap = new Map<number, number>();
  order.forEach((oldIdx, newIdx) => remap.set(oldIdx, newIdx));
  return {
    steps: order.map((oldIdx) => ({
      ...steps[oldIdx],
      after: steps[oldIdx].after.map((a) => remap.get(a)!).sort((a, b) =>
        a - b
      ),
    })),
    selected: selectedIdx != null ? (remap.get(selectedIdx) ?? null) : null,
  };
}

// ── Layout constants ──
const COL_WIDTH = 210;
const CARD_W = 186;
const CARD_H = 50;
const ROW_GAP = 24;

// ── Graph layout computation ──

interface GraphLayout {
  cols: number[];
  maxCol: number;
  svgW: number;
  svgH: number;
  stepY: Map<number, number>;
  colSorted: Map<number, number[]>;
  edges: {
    d: string;
    active: boolean;
    key: string;
    fromIdx: number;
    toIdx: number;
  }[];
  leafNodes: number[];
}

interface LayoutSizing {
  colWidth: number;
  cardW: number;
  cardH: number;
  rowHeight: number;
}

function computeDagLayout<T extends { after: number[] }>(
  items: T[],
  sel: number | null,
  size: LayoutSizing,
): GraphLayout {
  const { colWidth, cardW, cardH, rowHeight } = size;
  const cols = computeColumns(items);
  const maxCol = Math.max(0, ...cols);

  const colCounts = new Array(maxCol + 1).fill(0);
  for (const c of cols) if (c >= 0) colCounts[c]++;
  const maxRows = Math.max(1, ...colCounts);
  const svgW = (maxCol + 1) * colWidth;
  const svgH = maxRows * rowHeight;

  const stepY = new Map<number, number>();
  const colSorted = new Map<number, number[]>();

  for (let c = 0; c <= maxCol; c++) {
    const inCol: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (cols[i] === c) inCol.push(i);
    }
    if (c > 0) {
      inCol.sort((a, b) => {
        const avg = (idx: number) =>
          items[idx].after.length > 0
            ? items[idx].after.reduce((s, d) => s + (stepY.get(d) ?? 0), 0) /
              items[idx].after.length
            : 0;
        return avg(a) - avg(b);
      });
    }
    colSorted.set(c, inCol);
    const colH = inCol.length * rowHeight;
    const offsetY = (svgH - colH) / 2;
    inCol.forEach((idx, row) => {
      stepY.set(idx, offsetY + row * rowHeight + cardH / 2);
    });
  }

  const hasDependent = new Set<number>();
  for (const item of items) {
    for (const dep of item.after) hasDependent.add(dep);
  }
  const leafNodes = items.map((_, i) => i).filter((i) => !hasDependent.has(i));

  const edges: GraphLayout["edges"] = [];
  for (let i = 0; i < items.length; i++) {
    for (const dep of items[i].after) {
      const p1x = cols[dep] * colWidth + cardW;
      const p1y = stepY.get(dep) ?? 0;
      const p2x = cols[i] * colWidth;
      const p2y = stepY.get(i) ?? 0;
      const dx = Math.abs(p2x - p1x) * 0.5;
      const d = `M${p1x},${p1y} C${p1x + dx},${p1y} ${
        p2x - dx
      },${p2y} ${p2x},${p2y}`;
      const active = sel != null && (sel === i || sel === dep);
      edges.push({ d, active, key: `${dep}-${i}`, fromIdx: dep, toIdx: i });
    }
  }

  return { cols, maxCol, svgW, svgH, stepY, colSorted, edges, leafNodes };
}

function computeGraphLayout(
  steps: StepEntry[],
  sel: number | null,
  cardH: number,
): GraphLayout {
  return computeDagLayout(steps, sel, {
    colWidth: COL_WIDTH,
    cardW: CARD_W,
    cardH,
    rowHeight: cardH + ROW_GAP,
  });
}

// ── Nested (section-as-container) graph layout ──
// Each section is a bounding box containing its own step DAG.
// Sections themselves form a top-level DAG via section.after.

const SECTION_PAD_X = 14;
const SECTION_PAD_TOP = 60;
const SECTION_PAD_BOTTOM = 14;
const SECTION_GAP = 32;
const SECTION_MIN_W = 360;

interface NestedLayout {
  svgW: number;
  svgH: number;
  sectionBoxes: { x: number; y: number; w: number; h: number }[];
  /** Absolute top-left of the "add step" placeholder per section. */
  addStepTopLeft: { x: number; y: number }[];
  stepTopLeft: Map<number, { x: number; y: number }>;
  /** Per-section display number for each step (1-based, restarts per section). */
  displayNum: Map<number, number>;
  stepEdges: GraphLayout["edges"];
  sectionEdges: GraphLayout["edges"];
}

function computeNestedLayout(
  sections: SectionEntry[],
  steps: StepEntry[],
  cardH: number,
  selStep: number | null,
  selSec: number | null,
): NestedLayout {
  // Group steps by section index
  const stepsBySection: number[][] = sections.map(() => []);
  for (let i = 0; i < steps.length; i++) {
    const sec = steps[i].section;
    if (sec != null && sec >= 0 && sec < sections.length) {
      stepsBySection[sec].push(i);
    }
  }

  // Per-section display numbers (1-based, restart per section)
  const displayNum = new Map<number, number>();
  for (const stepIdxs of stepsBySection) {
    stepIdxs.forEach((g, n) => displayNum.set(g, n + 1));
  }

  // For each section, compute internal step layout. Reserve a slot at the
  // bottom of column 0 for an "add step" placeholder.
  const internal = sections.map((_, secIdx) => {
    const stepIdxs = stepsBySection[secIdx];
    if (stepIdxs.length === 0) {
      // Empty section: only the placeholder slot
      return {
        innerW: CARD_W,
        innerH: cardH,
        stepLocal: new Map<number, { x: number; y: number }>(),
        stepEdges: [] as GraphLayout["edges"],
        addStepLocal: { x: 0, y: 0 },
      };
    }
    const localToGlobal = stepIdxs;
    const globalToLocal = new Map<number, number>();
    stepIdxs.forEach((g, l) => globalToLocal.set(g, l));
    const localSteps = stepIdxs.map((g) => ({
      after: (steps[g].after ?? [])
        .map((d) => globalToLocal.get(d))
        .filter((v): v is number => v != null),
    }));
    const localSel = selStep != null
      ? globalToLocal.get(selStep) ?? null
      : null;
    const lay = computeDagLayout(localSteps, localSel, {
      colWidth: COL_WIDTH,
      cardW: CARD_W,
      cardH,
      rowHeight: cardH + ROW_GAP,
    });
    const stepLocal = new Map<number, { x: number; y: number }>();
    for (let l = 0; l < localSteps.length; l++) {
      const g = localToGlobal[l];
      const cx = lay.cols[l] * COL_WIDTH;
      const cy = (lay.stepY.get(l) ?? 0) - cardH / 2;
      stepLocal.set(g, { x: cx, y: cy });
    }
    // Find placeholder y: just below the lowest step in column 0
    let maxCol0Top = -1;
    for (let l = 0; l < localSteps.length; l++) {
      if (lay.cols[l] === 0) {
        const yTop = (lay.stepY.get(l) ?? 0) - cardH / 2;
        if (yTop > maxCol0Top) maxCol0Top = yTop;
      }
    }
    const addStepLocal = {
      x: 0,
      y: maxCol0Top >= 0 ? maxCol0Top + cardH + ROW_GAP : 0,
    };
    // Reserve vertical space for the placeholder
    const innerH = Math.max(lay.svgH, addStepLocal.y + cardH);
    // Map local-index edges to global indices
    const stepEdges = lay.edges.map((e) => ({
      d: e.d, // recomputed below in absolute coords
      active: e.active,
      key: `${localToGlobal[e.fromIdx]}-${localToGlobal[e.toIdx]}`,
      fromIdx: localToGlobal[e.fromIdx],
      toIdx: localToGlobal[e.toIdx],
    }));
    return { innerW: lay.svgW, innerH, stepLocal, stepEdges, addStepLocal };
  });

  // Section-level DAG layout (variable cell sizes, sections in same col stack vertically)
  const secCols = computeColumns(sections);
  const maxSecCol = Math.max(0, ...secCols);
  const secInCol: number[][] = Array.from(
    { length: maxSecCol + 1 },
    () => [] as number[],
  );
  for (let i = 0; i < sections.length; i++) secInCol[secCols[i]].push(i);

  const colW: number[] = secInCol.map((idxs) => {
    if (idxs.length === 0) return SECTION_MIN_W;
    return Math.max(
      SECTION_MIN_W,
      ...idxs.map((i) => internal[i].innerW + 2 * SECTION_PAD_X),
    );
  });
  const colX: number[] = [];
  let acc = 0;
  for (let c = 0; c <= maxSecCol; c++) {
    colX.push(acc);
    acc += colW[c] + SECTION_GAP;
  }
  const totalW = Math.max(0, acc - SECTION_GAP);

  const sectionBoxes = sections.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  let totalH = 0;
  for (let c = 0; c <= maxSecCol; c++) {
    let curY = 0;
    for (const idx of secInCol[c]) {
      const innerH = internal[idx].innerH;
      const boxW = colW[c];
      const boxH = innerH + SECTION_PAD_TOP + SECTION_PAD_BOTTOM;
      sectionBoxes[idx] = { x: colX[c], y: curY, w: boxW, h: boxH };
      curY += boxH + SECTION_GAP;
    }
    totalH = Math.max(totalH, curY - SECTION_GAP);
  }

  // Vertically center sections within their column relative to totalH
  for (let c = 0; c <= maxSecCol; c++) {
    let colTotal = 0;
    for (const idx of secInCol[c]) {
      colTotal += sectionBoxes[idx].h + SECTION_GAP;
    }
    colTotal -= SECTION_GAP;
    const offset = Math.max(0, (totalH - colTotal) / 2);
    for (const idx of secInCol[c]) {
      sectionBoxes[idx].y += offset;
    }
  }

  // Compute absolute step positions
  const stepTopLeft = new Map<number, { x: number; y: number }>();
  const addStepTopLeft: { x: number; y: number }[] = sections.map(() => ({
    x: 0,
    y: 0,
  }));
  for (let i = 0; i < sections.length; i++) {
    const box = sectionBoxes[i];
    for (const [g, local] of internal[i].stepLocal) {
      stepTopLeft.set(g, {
        x: box.x + SECTION_PAD_X + local.x,
        y: box.y + SECTION_PAD_TOP + local.y,
      });
    }
    addStepTopLeft[i] = {
      x: box.x + SECTION_PAD_X + internal[i].addStepLocal.x,
      y: box.y + SECTION_PAD_TOP + internal[i].addStepLocal.y,
    };
  }

  // Step edges in absolute coordinates
  const stepEdges: GraphLayout["edges"] = [];
  for (let s = 0; s < sections.length; s++) {
    for (const e of internal[s].stepEdges) {
      const fromTL = stepTopLeft.get(e.fromIdx);
      const toTL = stepTopLeft.get(e.toIdx);
      if (!fromTL || !toTL) continue;
      const p1x = fromTL.x + CARD_W;
      const p1y = fromTL.y + cardH / 2;
      const p2x = toTL.x;
      const p2y = toTL.y + cardH / 2;
      const dx = Math.abs(p2x - p1x) * 0.5;
      const d = `M${p1x},${p1y} C${p1x + dx},${p1y} ${
        p2x - dx
      },${p2y} ${p2x},${p2y}`;
      const active = selStep != null &&
        (selStep === e.toIdx || selStep === e.fromIdx);
      stepEdges.push({ ...e, d, active });
    }
  }

  // Section edges between section box borders
  const sectionEdges: GraphLayout["edges"] = [];
  for (let i = 0; i < sections.length; i++) {
    for (const dep of sections[i].after) {
      if (dep < 0 || dep >= sections.length) continue;
      const fromBox = sectionBoxes[dep];
      const toBox = sectionBoxes[i];
      const p1x = fromBox.x + fromBox.w;
      const p1y = fromBox.y + fromBox.h / 2;
      const p2x = toBox.x;
      const p2y = toBox.y + toBox.h / 2;
      const dx = Math.abs(p2x - p1x) * 0.4;
      const d = `M${p1x},${p1y} C${p1x + dx},${p1y} ${
        p2x - dx
      },${p2y} ${p2x},${p2y}`;
      const active = selSec != null && (selSec === dep || selSec === i);
      sectionEdges.push({
        d,
        active,
        key: `s-${dep}-${i}`,
        fromIdx: dep,
        toIdx: i,
      });
    }
  }

  return {
    svgW: totalW,
    svgH: totalH,
    sectionBoxes,
    addStepTopLeft,
    stepTopLeft,
    displayNum,
    stepEdges,
    sectionEdges,
  };
}

// ── Shared graph-card components ──

function StepCardEl(
  {
    index,
    displayNum,
    step,
    position,
    cardH,
    borderClass,
    onSelect,
    onInsert,
    onBranch,
    onRemove,
    onDragStart,
  }: {
    index: number;
    /** Number shown on the card. 1-based, restarts per section in nested mode. */
    displayNum: number;
    step: StepEntry;
    position: { x: number; y: number };
    cardH: number;
    borderClass: string;
    onSelect: (e: MouseEvent) => void;
    onInsert: () => void;
    onBranch: () => void;
    onRemove: () => void;
    onDragStart: (e: MouseEvent) => void;
  },
) {
  return (
    <div
      data-step-idx={index}
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${CARD_W}px`,
        height: `${cardH}px`,
      }}
      class={`px-2 py-1.5 border-2 cursor-pointer transition-colors text-sm bg-stone-100 dark:bg-stone-800 flex flex-col justify-center ${borderClass}`}
      onClick={onSelect}
    >
      <div class="flex items-center gap-1 min-w-0">
        <span class="text-xs text-stone-400 font-mono shrink-0">
          #{displayNum}
        </span>
        <span class="font-medium truncate flex-1 min-w-0">
          {step.title.trim() || (
            <span class="text-stone-400 italic">untitled</span>
          )}
        </span>
        <div class="flex items-center shrink-0 -mr-1">
          <button
            type="button"
            title="Insert step in sequence"
            class="text-stone-400 hover:text-orange-600 p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onInsert();
            }}
          >
            <TbPlus class="size-3.5" />
          </button>
          <button
            type="button"
            title="Add parallel branch"
            class="text-stone-400 hover:text-blue-600 p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onBranch();
            }}
          >
            <TbPlus
              class="size-3.5"
              style={{ transform: "rotate(45deg)" }}
            />
          </button>
          <button
            type="button"
            class="text-stone-400 hover:text-red-600 p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <TbTrash class="size-3.5" />
          </button>
        </div>
      </div>
      <div
        class="absolute top-1/2 -right-2.5 w-5 h-5 -mt-2.5 flex items-center justify-center cursor-crosshair"
        onMouseDown={onDragStart}
      >
        <div class="w-2.5 h-2.5 rounded-full bg-stone-300 dark:bg-stone-600 hover:bg-orange-400 dark:hover:bg-orange-500 transition-colors" />
      </div>
    </div>
  );
}

function AddStepEl(
  { position, cardH, onClick }: {
    position: { x: number; y: number };
    cardH: number;
    onClick: () => void;
  },
) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${CARD_W}px`,
        height: `${cardH}px`,
      }}
      class="border-2 border-dashed border-stone-300 dark:border-stone-600 hover:border-orange-400 dark:hover:border-orange-500 cursor-pointer transition-colors flex items-center justify-center text-stone-400 hover:text-orange-600 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <TbPlus class="size-3.5 mr-1" />Add starting step
    </div>
  );
}

function EdgePath(
  {
    d,
    active,
    color,
    onRemove,
  }: {
    d: string;
    active: boolean;
    color: "step" | "section";
    onRemove: () => void;
  },
) {
  const baseStroke = color === "section"
    ? "var(--color-orange-400)"
    : "var(--color-stone-400)";
  const activeStroke = "var(--color-orange-500)";
  const strokeW = color === "section"
    ? (active ? 3 : 2.5)
    : (active ? 2.5 : 1.5);
  const opacity = color === "section" ? (active ? 1 : 0.7) : (active ? 1 : 0.4);
  const hitW = color === "section" ? 14 : 12;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        stroke-width={hitW}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onClick={onRemove}
      />
      <path
        d={d}
        fill="none"
        stroke={active ? activeStroke : baseStroke}
        stroke-width={strokeW}
        opacity={opacity}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

// ── Step editor (shared between list and graph modes) ──

function StepEditor(
  {
    step,
    index: _index,
    sections,
    onTitle,
    onBody,
    onSection,
    onRemoveMedia,
    onUploadMedia,
    uploading,
  }: {
    step: StepEntry;
    index: number;
    sections: SectionEntry[];
    onTitle: (v: string) => void;
    onBody: (v: string) => void;
    onSection: (idx: number | null) => void;
    onRemoveMedia: (mi: number) => void;
    onUploadMedia: () => void;
    uploading: boolean;
  },
) {
  return (
    <div class="space-y-2">
      <input
        type="text"
        placeholder="Step title"
        value={step.title}
        onInput={(e) => onTitle((e.target as HTMLInputElement).value)}
        class="w-full text-sm font-medium"
      />
      {sections.length > 0 && (
        <select
          value={step.section ?? ""}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onSection(v === "" ? null : parseInt(v));
          }}
          class="text-xs"
        >
          <option value="">— no section —</option>
          {sections.map((sec, si) => (
            <option key={sec._uid ?? si} value={si}>
              {sec.title.trim() || `Section ${si + 1}`}
            </option>
          ))}
        </select>
      )}
      <textarea
        placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
        value={step.body}
        onInput={(e) => onBody((e.target as HTMLTextAreaElement).value)}
        rows={6}
        class="w-full text-sm font-mono"
      />
      {step.media.length > 0 && (
        <div class="flex flex-wrap gap-2">
          {step.media.map((m, mi) => (
            <div key={m.id} class="relative group">
              <img
                src={m.url}
                alt=""
                class="w-20 h-20 object-cover border-2 border-stone-300 dark:border-stone-700"
              />
              <button
                type="button"
                onClick={() => onRemoveMedia(mi)}
                class="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <TbX class="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" class="link text-xs" onClick={onUploadMedia}>
        {uploading ? "Uploading..." : (
          <span>
            <TbUpload class="size-3 inline mr-0.5" />Add images
          </span>
        )}
      </button>
    </div>
  );
}

// ── Main component ──

export default function StepForm(
  { initialSteps, initialSections, mode }: StepFormProps,
) {
  const items = useSignal<StepEntry[]>(
    initialSteps.length > 0
      ? (() => {
        // Drop any cross-section step deps from incoming data — step deps must
        // stay intra-section (cross-section ordering lives in section.after).
        const sectionByIdx = initialSteps.map((s) => s.section ?? null);
        return initialSteps.map((s, i) => ({
          ...s,
          section: s.section ?? null,
          after: (s.after ?? []).filter(
            (d) => sectionByIdx[d] === sectionByIdx[i],
          ),
          _uid: crypto.randomUUID(),
        }));
      })()
      : [newStep()],
  );
  const sections = useSignal<SectionEntry[]>(
    (initialSections ?? []).map((s) =>
      newSection({
        title: s.title,
        key: s.key,
        keyDirty: true, // existing keys shouldn't be auto-overwritten
        after: s.after ?? [],
      })
    ),
  );
  const selected = useSignal<number | null>(null);
  const uploading = useSignal<number | null>(null);
  const savedGraphDeps = useSignal<number[][] | null>(null);
  const savedSectionDeps = useSignal<number[][] | null>(null);
  const dragFrom = useSignal<number | null>(null);
  const dragPos = useSignal<{ x: number; y: number } | null>(null);
  const secSelected = useSignal<number | null>(null);
  const secDragFrom = useSignal<number | null>(null);
  const secDragPos = useSignal<{ x: number; y: number } | null>(null);

  // ── Section helpers ──

  function addSection() {
    const isFirst = sections.value.length === 0;
    sections.value = [...sections.value, newSection()];
    // Auto-assign existing loose steps to the new section so we don't end up
    // with orphan steps that can't be displayed in the nested graph.
    if (isFirst) {
      const newIdx = sections.value.length - 1;
      items.value = items.value.map((s) =>
        s.section == null ? { ...s, section: newIdx } : s
      );
    }
  }

  function removeSection(idx: number) {
    // Find steps belonging to this section — they get deleted with it.
    const deletedSteps = new Set<number>();
    items.value.forEach((s, i) => {
      if (s.section === idx) deletedSteps.add(i);
    });
    if (deletedSteps.size > 0) {
      const ok = globalThis.confirm(
        `Delete this section and its ${deletedSteps.size} step${
          deletedSteps.size === 1 ? "" : "s"
        }?`,
      );
      if (!ok) return;
    }

    // Remap surviving step indices old → new
    const oldToNewStep = new Map<number, number>();
    let nextNew = 0;
    for (let i = 0; i < items.value.length; i++) {
      if (!deletedSteps.has(i)) oldToNewStep.set(i, nextNew++);
    }

    const newItems = items.value
      .filter((_, i) => !deletedSteps.has(i))
      .map((s) => ({
        ...s,
        section: s.section != null && s.section > idx
          ? s.section - 1
          : s.section,
        after: s.after
          .filter((a) => !deletedSteps.has(a))
          .map((a) => oldToNewStep.get(a)!)
          .sort((a, b) => a - b),
      }));

    // Splice the deleted section out of the section DAG: anyone depending on
    // it now depends on whatever it depended on (A→C→D + B→C with C deleted
    // becomes A→D + B→D).
    const deletedSecDeps = sections.value[idx].after;
    const newSections = sections.value
      .filter((_, i) => i !== idx)
      .map((sec) => {
        let after = sec.after;
        if (after.includes(idx)) {
          after = [
            ...new Set([
              ...after.filter((a) => a !== idx),
              ...deletedSecDeps,
            ]),
          ];
        }
        return {
          ...sec,
          after: after.map((a) => (a > idx ? a - 1 : a)).sort((a, b) => a - b),
        };
      });

    if (selected.value != null) {
      selected.value = deletedSteps.has(selected.value)
        ? null
        : (oldToNewStep.get(selected.value) ?? null);
    }
    if (secSelected.value != null) {
      secSelected.value = secSelected.value === idx
        ? null
        : secSelected.value > idx
        ? secSelected.value - 1
        : secSelected.value;
    }

    items.value = newItems;
    sections.value = newSections;
  }

  function updateSectionTitle(idx: number, title: string) {
    const next = [...sections.value];
    const sec = next[idx];
    next[idx] = {
      ...sec,
      title,
      key: sec.keyDirty ? sec.key : slugify(title),
    };
    sections.value = next;
  }

  function updateSectionKey(idx: number, key: string) {
    const next = [...sections.value];
    next[idx] = { ...next[idx], key, keyDirty: true };
    sections.value = next;
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= sections.value.length) return;
    const remap = (a: number) => a === idx ? target : a === target ? idx : a;
    const next = [...sections.value];
    [next[idx], next[target]] = [next[target], next[idx]];
    // Remap section deps through the swap
    for (let i = 0; i < next.length; i++) {
      next[i] = { ...next[i], after: next[i].after.map(remap) };
    }
    // Remap step.section indices through the swap
    items.value = items.value.map((s) => {
      if (s.section == null) return s;
      return { ...s, section: remap(s.section) };
    });
    sections.value = next;
  }

  function graphInsertSectionAfter(depIdx: number) {
    const newIdx = sections.value.length;
    // Sections that previously depended on depIdx now depend on the new one
    const rewired = sections.value.map((s) => ({
      ...s,
      after: s.after.map((a) => (a === depIdx ? newIdx : a)),
    }));
    sections.value = [...rewired, newSection({ after: [depIdx] })];
    secSelected.value = newIdx;
  }

  function graphBranchSectionAfter(depIdx: number) {
    const newIdx = sections.value.length;
    sections.value = [
      ...sections.value,
      newSection({ after: [depIdx] }),
    ];
    secSelected.value = newIdx;
  }

  function addSectionDep(stepIdx: number, depIdx: number) {
    if (stepIdx === depIdx) return;
    if (sections.value[stepIdx].after.includes(depIdx)) return;
    const next = [...sections.value];
    next[stepIdx] = {
      ...next[stepIdx],
      after: [...next[stepIdx].after, depIdx].sort((a, b) => a - b),
    };
    sections.value = next;
  }

  function removeSectionDep(stepIdx: number, depIdx: number) {
    const next = [...sections.value];
    next[stepIdx] = {
      ...next[stepIdx],
      after: next[stepIdx].after.filter((a) => a !== depIdx),
    };
    sections.value = next;
  }

  function setStepSection(stepIndex: number, secIdx: number | null) {
    const next = [...items.value];
    next[stepIndex] = { ...next[stepIndex], section: secIdx };
    items.value = next;
  }

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
          media: [...next[stepIndex].media, {
            id: String(data.id),
            url: String(data.url),
          }],
        };
      } catch { /* skip */ }
    }
    items.value = next;
    uploading.value = null;
  }

  function removeMedia(stepIndex: number, mediaIndex: number) {
    const next = [...items.value];
    const item = next[stepIndex];
    fetch(`/api/media/${item.media[mediaIndex].id}`, { method: "DELETE" })
      .catch(() => {});
    next[stepIndex] = {
      ...item,
      media: item.media.filter((_, i) => i !== mediaIndex),
    };
    items.value = next;
  }

  function triggerFileUpload(stepIndex: number) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => uploadMedia(stepIndex, input.files);
    input.click();
  }

  // ── Graph mutations ──

  function applyGraphChange(
    next: StepEntry[],
    newSelIdx: number | null = selected.value,
  ) {
    const r = reindexSteps(next, newSelIdx);
    items.value = r.steps;
    selected.value = r.selected;
  }

  function graphInsertAfter(depIndex: number) {
    const newIdx = items.value.length;
    const rewired = items.value.map((s) => ({
      ...s,
      after: s.after.map((a) => (a === depIndex ? newIdx : a)),
    }));
    applyGraphChange(
      [...rewired, newStep({ after: [depIndex] })],
      newIdx,
    );
  }

  function graphBranchAfter(depIndex: number) {
    const newIdx = items.value.length;
    applyGraphChange(
      [...items.value, newStep({ after: [depIndex] })],
      newIdx,
    );
  }

  function graphAddStart() {
    const newIdx = items.value.length;
    applyGraphChange(
      [...items.value, newStep()],
      newIdx,
    );
  }

  function graphAddStartInSection(secIdx: number) {
    const newIdx = items.value.length;
    applyGraphChange(
      [...items.value, newStep({ section: secIdx })],
      newIdx,
    );
  }

  /** List mode: append a new step (assigned to a section, or loose if null). */
  function listAddStep(secIdx: number | null) {
    const prev = items.value.length - 1;
    items.value = [
      ...items.value,
      newStep({
        section: secIdx,
        after: prev >= 0 ? [prev] : [],
      }),
    ];
  }

  /** List mode: swap two step entries in items.value (within a section). */
  function listSwapSteps(idxA: number, idxB: number) {
    if (idxA === idxB) return;
    const next = [...items.value];
    [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
    items.value = toLinearChain(next);
  }

  function graphRemoveStep(index: number) {
    const newSel = selected.value === index
      ? null
      : selected.value != null && selected.value > index
      ? selected.value - 1
      : selected.value;

    const deletedDeps = items.value[index].after;
    const next = items.value.filter((_, i) => i !== index).map((s) => {
      let after = s.after;
      if (after.includes(index)) {
        after = [
          ...new Set([...after.filter((a) => a !== index), ...deletedDeps]),
        ];
      }
      return {
        ...s,
        after: after.map((a) => (a > index ? a - 1 : a)).sort((a, b) => a - b),
      };
    });

    if (next.length === 0) {
      items.value = [newStep()];
      selected.value = null;
      return;
    }
    applyGraphChange(next, newSel);
  }

  function addDep(stepIndex: number, depIndex: number) {
    if (stepIndex === depIndex) return;
    if (items.value[stepIndex].after.includes(depIndex)) return;
    const next = [...items.value];
    next[stepIndex] = {
      ...next[stepIndex],
      after: [...next[stepIndex].after, depIndex].sort((a, b) => a - b),
    };
    applyGraphChange(next);
  }

  function removeDep(stepIndex: number, depIndex: number) {
    const next = [...items.value];
    next[stepIndex] = {
      ...next[stepIndex],
      after: next[stepIndex].after.filter((a) => a !== depIndex),
    };
    applyGraphChange(next);
  }

  // ── Drag-to-connect ──

  function onDragHandleMouseDown(index: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragFrom.value = index;

    const container = (e.target as HTMLElement).closest(
      "[data-graph-container]",
    ) as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragPos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (me: MouseEvent) => {
      dragPos.value = { x: me.clientX - rect.left, y: me.clientY - rect.top };
    };
    const onUp = (ue: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const target = document.elementFromPoint(ue.clientX, ue.clientY);
      const cardEl = target?.closest("[data-step-idx]") as HTMLElement | null;
      if (cardEl && dragFrom.value != null) {
        const toIdx = parseInt(cardEl.dataset.stepIdx!);
        if (!isNaN(toIdx) && toIdx !== dragFrom.value) {
          // Only allow intra-section step deps
          const fromSec = items.value[dragFrom.value]?.section ?? null;
          const toSec = items.value[toIdx]?.section ?? null;
          if (fromSec === toSec) {
            addDep(toIdx, dragFrom.value);
          }
        }
      }
      dragFrom.value = null;
      dragPos.value = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onSectionDragHandleMouseDown(index: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    secDragFrom.value = index;

    const container = (e.target as HTMLElement).closest(
      "[data-section-graph-container]",
    ) as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    secDragPos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (me: MouseEvent) => {
      secDragPos.value = {
        x: me.clientX - rect.left,
        y: me.clientY - rect.top,
      };
    };
    const onUp = (ue: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const target = document.elementFromPoint(ue.clientX, ue.clientY);
      const cardEl = target?.closest("[data-section-idx]") as
        | HTMLElement
        | null;
      if (cardEl && secDragFrom.value != null) {
        const toIdx = parseInt(cardEl.dataset.sectionIdx!);
        if (!isNaN(toIdx) && toIdx !== secDragFrom.value) {
          addSectionDep(toIdx, secDragFrom.value);
        }
      }
      secDragFrom.value = null;
      secDragPos.value = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Mode switching ──

  // Section deps: list mode treats sections as a linear chain (top-to-bottom).
  // Save+linearize on list entry, restore on graph entry. We skip saving an
  // "all-empty" deps state — that's just default no-info, not an explicit
  // user choice — so the first list→graph switch keeps the linear chain.
  if (mode.value === "list" && !isLinearSectionChain(sections.value)) {
    const hasExplicit = sections.value.some((s) => s.after.length > 0);
    if (hasExplicit) {
      savedSectionDeps.value = sections.value.map((s) => [...s.after]);
    }
    sections.value = toLinearSectionChain(sections.value);
  } else if (mode.value === "graph" && savedSectionDeps.value != null) {
    if (savedSectionDeps.value.length === sections.value.length) {
      sections.value = sections.value.map((s, i) => ({
        ...s,
        after: savedSectionDeps.value![i],
      }));
    }
    savedSectionDeps.value = null;
  }

  if (mode.value === "list" && !isLinearChain(items.value)) {
    savedGraphDeps.value = items.value.map((s) => [...s.after]);
    items.value = toLinearChain(items.value);
    selected.value = null;
  } else if (mode.value === "graph" && savedGraphDeps.value != null) {
    if (savedGraphDeps.value.length === items.value.length) {
      items.value = items.value.map((s, i) => ({
        ...s,
        after: savedGraphDeps.value![i],
      }));
    }
    savedGraphDeps.value = null;
  }

  // ── Render ──

  const steps = items.value;
  const sel = selected.value;
  const isGraph = mode.value === "graph";
  const hasSections = sections.value.length > 0;
  const cardH = CARD_H;
  const rowHeight = cardH + ROW_GAP;
  // Flat layout (no sections) — used when sections aren't in play
  const flatLayout = isGraph && !hasSections
    ? computeGraphLayout(steps, sel, cardH)
    : null;
  // Nested layout (sections as containers) — used when sections exist
  const nested = isGraph && hasSections
    ? computeNestedLayout(
      sections.value,
      steps,
      cardH,
      sel,
      secSelected.value,
    )
    : null;

  const selDeps = new Set(sel != null ? steps[sel]?.after ?? [] : []);
  const selDependents = new Set<number>();
  if (sel != null) {
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].after.includes(sel)) selDependents.add(i);
    }
  }

  // Live step drag line — works for both flat and nested
  const dragLine = (() => {
    if (dragFrom.value == null || !dragPos.value) return null;
    let p1x: number, p1y: number;
    if (nested) {
      const tl = nested.stepTopLeft.get(dragFrom.value);
      if (!tl) return null;
      p1x = tl.x + CARD_W;
      p1y = tl.y + cardH / 2;
    } else if (flatLayout) {
      p1x = flatLayout.cols[dragFrom.value] * COL_WIDTH + CARD_W;
      p1y = flatLayout.stepY.get(dragFrom.value) ?? 0;
    } else return null;
    const p2 = dragPos.value;
    const dx = Math.abs(p2.x - p1x) * 0.4;
    return `M${p1x},${p1y} C${p1x + dx},${p1y} ${
      p2.x - dx
    },${p2.y} ${p2.x},${p2.y}`;
  })();

  // Live section drag line (for nested mode)
  const secDragLine = (() => {
    if (secDragFrom.value == null || !secDragPos.value || !nested) return null;
    const box = nested.sectionBoxes[secDragFrom.value];
    if (!box) return null;
    const p1x = box.x + box.w;
    const p1y = box.y + box.h / 2;
    const p2 = secDragPos.value;
    const dx = Math.abs(p2.x - p1x) * 0.4;
    return `M${p1x},${p1y} C${p1x + dx},${p1y} ${
      p2.x - dx
    },${p2.y} ${p2.x},${p2.y}`;
  })();

  return (
    <div class="mt-4 space-y-4">
      {/* ── List mode (sections as containers) ── */}
      {!isGraph && (() => {
        // Group step indices by section
        const looseStepIdxs: number[] = [];
        const stepsBySection: number[][] = sections.value.map(() => []);
        steps.forEach((s, i) => {
          if (s.section == null) {
            looseStepIdxs.push(i);
          } else if (s.section >= 0 && s.section < sections.value.length) {
            stepsBySection[s.section].push(i);
          } else {
            looseStepIdxs.push(i);
          }
        });

        function renderStepCard(
          i: number,
          displayN: number,
          group: number[],
          posInGroup: number,
        ) {
          const item = steps[i];
          return (
            <div key={item._uid ?? i} class="card p-3 space-y-2">
              <div class="flex flex-wrap sm:flex-nowrap gap-2 items-center min-w-0">
                <span class="text-xs text-stone-400 font-mono shrink-0 max-sm:order-1">
                  #{displayN}
                </span>
                <input
                  type="text"
                  placeholder="Step title"
                  value={item.title}
                  onInput={(e) =>
                    updateField(
                      i,
                      "title",
                      (e.target as HTMLInputElement).value,
                    )}
                  class="flex-1 min-w-0 text-sm font-medium max-sm:order-3 max-sm:basis-full"
                />
                <div class="flex items-center gap-1 shrink-0 max-sm:order-2 max-sm:ml-auto">
                  <button
                    type="button"
                    disabled={posInGroup === 0}
                    class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                    onClick={() => {
                      if (posInGroup === 0) return;
                      listSwapSteps(i, group[posInGroup - 1]);
                    }}
                  >
                    <TbArrowUp class="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={posInGroup === group.length - 1}
                    class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                    onClick={() => {
                      if (posInGroup === group.length - 1) return;
                      listSwapSteps(i, group[posInGroup + 1]);
                    }}
                  >
                    <TbArrowDown class="size-4" />
                  </button>
                  <button
                    type="button"
                    class="text-red-600 hover:text-red-700 p-1 cursor-pointer"
                    onClick={() => {
                      items.value = toLinearChain(
                        items.value.filter((_, j) => j !== i),
                      );
                    }}
                  >
                    <TbTrash class="size-4" />
                  </button>
                </div>
              </div>
              {sections.value.length > 0 && (
                <select
                  value={item.section ?? ""}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    setStepSection(i, v === "" ? null : parseInt(v));
                  }}
                  class="text-xs"
                >
                  <option value="">— no section —</option>
                  {sections.value.map((sec, si) => (
                    <option key={sec._uid ?? si} value={si}>
                      {sec.title.trim() || `Section ${si + 1}`}
                    </option>
                  ))}
                </select>
              )}
              <textarea
                placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
                value={item.body}
                onInput={(e) =>
                  updateField(
                    i,
                    "body",
                    (e.target as HTMLTextAreaElement).value,
                  )}
                rows={6}
                class="w-full text-sm font-mono"
              />
              {item.media.length > 0 && (
                <div class="flex flex-wrap gap-2">
                  {item.media.map((m, mi) => (
                    <div key={m.id} class="relative group">
                      <img
                        src={m.url}
                        alt=""
                        class="w-20 h-20 object-cover border-2 border-stone-300 dark:border-stone-700"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          removeMedia(i, mi)}
                        class="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <TbX class="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                class="link text-xs"
                onClick={() => triggerFileUpload(i)}
              >
                {uploading.value === i ? "Uploading..." : (
                  <span>
                    <TbUpload class="size-3 inline mr-0.5" />Add images
                  </span>
                )}
              </button>
            </div>
          );
        }

        return (
          <div class="space-y-4">
            {/* Loose steps (no section) */}
            {looseStepIdxs.length > 0 && (
              <div class="space-y-3">
                {looseStepIdxs.map((i, n) =>
                  renderStepCard(i, n + 1, looseStepIdxs, n)
                )}
                {sections.value.length === 0 && (
                  <button
                    type="button"
                    onClick={() => listAddStep(null)}
                    class="link text-sm font-medium"
                  >
                    <TbPlus class="size-3.5 inline mr-1" />Add step
                  </button>
                )}
              </div>
            )}

            {/* Sections, each containing its own steps */}
            {sections.value.map((sec, sIdx) => {
              const group = stepsBySection[sIdx];
              return (
                <div
                  key={sec._uid ?? sIdx}
                  class="border-2 border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/40 p-3 space-y-3"
                >
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Section title"
                      value={sec.title}
                      onInput={(e) =>
                        updateSectionTitle(
                          sIdx,
                          (e.target as HTMLInputElement).value,
                        )}
                      class="flex-1 font-bold min-w-0"
                    />
                    <input
                      type="text"
                      placeholder="key"
                      value={sec.key}
                      onInput={(e) =>
                        updateSectionKey(
                          sIdx,
                          (e.target as HTMLInputElement).value,
                        )}
                      class="w-32 text-xs font-mono shrink-0"
                      title="Used in @step(key.N) references"
                    />
                    <button
                      type="button"
                      disabled={sIdx === 0}
                      class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                      onClick={() => moveSection(sIdx, -1)}
                    >
                      <TbArrowUp class="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={sIdx === sections.value.length - 1}
                      class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                      onClick={() => moveSection(sIdx, 1)}
                    >
                      <TbArrowDown class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="text-red-600 hover:text-red-700 p-1 cursor-pointer"
                      onClick={() => removeSection(sIdx)}
                    >
                      <TbTrash class="size-4" />
                    </button>
                  </div>
                  {group.length > 0 && (
                    <div class="space-y-3">
                      {group.map((i, n) => renderStepCard(i, n + 1, group, n))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => listAddStep(sIdx)}
                    class="link text-sm font-medium"
                  >
                    <TbPlus class="size-3.5 inline mr-1" />Add step
                  </button>
                </div>
              );
            })}

            {/* Add section */}
            <button
              type="button"
              onClick={addSection}
              class="link text-sm font-medium"
            >
              <TbPlus class="size-3.5 inline mr-1" />Add section
            </button>
          </div>
        );
      })()}

      {/* ── Nested graph (sections containing steps) ── */}
      {isGraph && nested && (
        <div class="overflow-x-auto pb-2" data-graph-container>
          <div data-section-graph-container>
            <div
              style={{
                position: "relative",
                width: `${nested.svgW + 4}px`,
                minHeight: `${nested.svgH + SECTION_GAP + 56 + ROW_GAP}px`,
              }}
            >
              {/* Section bounding boxes (drawn behind everything) */}
              {sections.value.map((sec, sIdx) => {
                const box = nested.sectionBoxes[sIdx];
                if (!box) {
                  return null;
                }
                const isSelected = secSelected.value === sIdx;
                const isDragSrc = secDragFrom.value === sIdx;
                const borderClass = isDragSrc
                  ? "border-orange-400 ring-2 ring-orange-200 dark:ring-orange-800"
                  : isSelected
                  ? "border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800"
                  : "border-stone-300 dark:border-stone-700";
                const stepCount = steps.filter((st) =>
                  st.section === sIdx
                ).length;
                return (
                  <div
                    key={sec._uid ?? sIdx}
                    data-section-idx={sIdx}
                    style={{
                      position: "absolute",
                      left: `${box.x}px`,
                      top: `${box.y}px`,
                      width: `${box.w}px`,
                      height: `${box.h}px`,
                      zIndex: 0,
                    }}
                    class={`border-2 bg-stone-50 dark:bg-stone-900/40 ${borderClass}`}
                    onClick={(e) => {
                      // Only select if click was on the section background, not a step
                      if (
                        (e.target as HTMLElement).closest("[data-step-idx]")
                      ) {
                        return;
                      }
                      secSelected.value = isSelected ? null : sIdx;
                    }}
                  >
                    <div class="px-2 pt-2 pb-1 flex items-center gap-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Section title"
                        value={sec.title}
                        onClick={(e) => e.stopPropagation()}
                        onInput={(e) =>
                          updateSectionTitle(
                            sIdx,
                            (e.target as HTMLInputElement).value,
                          )}
                        class="flex-1 min-w-0 font-bold"
                      />
                      <input
                        type="text"
                        placeholder="key"
                        value={sec.key}
                        onClick={(e) =>
                          e.stopPropagation()}
                        onInput={(e) =>
                          updateSectionKey(
                            sIdx,
                            (e.target as HTMLInputElement).value,
                          )}
                        title="Used in @step(key.N) references"
                        class="w-32 text-xs font-mono shrink-0"
                      />
                      <span class="text-[10px] text-stone-400 shrink-0">
                        {stepCount} {stepCount === 1 ? "step" : "steps"}
                      </span>
                      <div class="flex items-center shrink-0 -mr-1">
                        <button
                          type="button"
                          title="Insert section in sequence"
                          class="text-stone-400 hover:text-orange-600 p-0.5 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            graphInsertSectionAfter(sIdx);
                          }}
                        >
                          <TbPlus class="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Add parallel section"
                          class="text-stone-400 hover:text-blue-600 p-0.5 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            graphBranchSectionAfter(sIdx);
                          }}
                        >
                          <TbPlus
                            class="size-3.5"
                            style={{ transform: "rotate(45deg)" }}
                          />
                        </button>
                        <button
                          type="button"
                          title="Delete section"
                          class="text-stone-400 hover:text-red-600 p-0.5 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSection(sIdx);
                          }}
                        >
                          <TbTrash class="size-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Section drag handle */}
                    <div
                      class="absolute top-1/2 -right-2.5 w-5 h-5 -mt-2.5 flex items-center justify-center cursor-crosshair"
                      style={{ zIndex: 4 }}
                      onMouseDown={(e) =>
                        onSectionDragHandleMouseDown(
                          sIdx,
                          e as unknown as MouseEvent,
                        )}
                      title="Drag to add a section dep"
                    >
                      <div class="w-2.5 h-2.5 rounded-full bg-orange-300 dark:bg-orange-700 hover:bg-orange-500 dark:hover:bg-orange-400 transition-colors" />
                    </div>
                  </div>
                );
              })}

              {/* "Add starting section" placeholder under col 0 */}
              {(() => {
                let col0Bottom = 0;
                let col0W = 0;
                for (const box of nested.sectionBoxes) {
                  if (box.x === 0) {
                    col0Bottom = Math.max(col0Bottom, box.y + box.h);
                    col0W = box.w;
                  }
                }
                if (col0W === 0) {
                  return null;
                }
                const placeholderH = 56;
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: `${col0Bottom + SECTION_GAP}px`,
                      width: `${col0W}px`,
                      height: `${placeholderH}px`,
                      zIndex: 0,
                    }}
                    class="border-2 border-dashed border-stone-300 dark:border-stone-600 hover:border-orange-400 dark:hover:border-orange-500 cursor-pointer transition-colors flex items-center justify-center text-stone-500 hover:text-orange-600 text-xs font-medium"
                    onClick={addSection}
                  >
                    <TbPlus class="size-4 mr-1" />Add starting section
                  </div>
                );
              })()}

              {/* Steps positioned inside their section boxes */}
              <div style={{ position: "relative", zIndex: 2 }}>
                {steps.map((step, index) => {
                  const tl = nested.stepTopLeft.get(index);
                  if (!tl) {
                    return null;
                  }
                  const isSelected = sel === index;
                  const borderClass = dragFrom.value === index
                    ? "border-orange-400 ring-2 ring-orange-200 dark:ring-orange-800"
                    : isSelected
                    ? "border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800"
                    : selDeps.has(index)
                    ? "border-green-400 dark:border-green-600"
                    : selDependents.has(index)
                    ? "border-blue-300 dark:border-blue-700"
                    : "border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600";
                  return (
                    <StepCardEl
                      key={index}
                      index={index}
                      displayNum={nested.displayNum.get(index) ?? index + 1}
                      step={step}
                      position={tl}
                      cardH={cardH}
                      borderClass={borderClass}
                      onSelect={(e) => {
                        e.stopPropagation();
                        selected.value = isSelected ? null : index;
                      }}
                      onInsert={() => graphInsertAfter(index)}
                      onBranch={() =>
                        graphBranchAfter(index)}
                      onRemove={() => graphRemoveStep(index)}
                      onDragStart={(e) => onDragHandleMouseDown(index, e)}
                    />
                  );
                })}

                {/* Per-section "Add step" placeholder cards */}
                {sections.value.map((sec, sIdx) => {
                  const tl = nested.addStepTopLeft[sIdx];
                  if (!tl) return null;
                  return (
                    <AddStepEl
                      key={`add-step-${sec._uid ?? sIdx}`}
                      position={tl}
                      cardH={cardH}
                      onClick={() => graphAddStartInSection(sIdx)}
                    />
                  );
                })}
              </div>

              {/* SVG edges for both step and section deps */}
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  zIndex: 1,
                  pointerEvents: "none",
                  overflow: "visible",
                }}
                width={nested.svgW}
                height={nested.svgH}
              >
                {/* Section edges (thicker, drawn first/behind) */}
                {nested.sectionEdges.map(
                  ({ d, active, key, fromIdx, toIdx }) => (
                    <EdgePath
                      key={key}
                      d={d}
                      active={active}
                      color="section"
                      onRemove={() => removeSectionDep(toIdx, fromIdx)}
                    />
                  ),
                )}
                {/* Step edges */}
                {nested.stepEdges.map(({ d, active, key, fromIdx, toIdx }) => (
                  <EdgePath
                    key={`step-${key}`}
                    d={d}
                    active={active}
                    color="step"
                    onRemove={() => removeDep(toIdx, fromIdx)}
                  />
                ))}
                {dragLine && (
                  <path
                    d={dragLine}
                    fill="none"
                    stroke="var(--color-orange-500)"
                    stroke-width={2}
                    stroke-dasharray="6 4"
                    opacity={0.7}
                  />
                )}
                {secDragLine && (
                  <path
                    d={secDragLine}
                    fill="none"
                    stroke="var(--color-orange-500)"
                    stroke-width={2.5}
                    stroke-dasharray="6 4"
                    opacity={0.7}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── Flat graph mode (no sections) ── */}
      {isGraph && flatLayout && (
        <div class="space-y-2">
          <div class="flex justify-end">
            <button
              type="button"
              class="link text-xs"
              onClick={addSection}
              title="Group steps into sections"
            >
              <TbPlus class="size-3 inline mr-0.5" />Add section
            </button>
          </div>
          <div class="overflow-x-auto pb-2">
            <div
              data-graph-container
              style={{
                position: "relative",
                width: `${flatLayout.svgW}px`,
                minHeight: `${flatLayout.svgH + rowHeight}px`,
              }}
            >
              <div style={{ position: "relative", zIndex: 2 }}>
                {steps.map((step, index) => {
                  const y = (flatLayout.stepY.get(index) ?? 0) - cardH / 2;
                  const x = flatLayout.cols[index] * COL_WIDTH;
                  const isSelected = sel === index;
                  const borderClass = dragFrom.value === index
                    ? "border-orange-400 ring-2 ring-orange-200 dark:ring-orange-800"
                    : isSelected
                    ? "border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800"
                    : selDeps.has(index)
                    ? "border-green-400 dark:border-green-600"
                    : selDependents.has(index)
                    ? "border-blue-300 dark:border-blue-700"
                    : "border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600";
                  return (
                    <StepCardEl
                      key={index}
                      index={index}
                      displayNum={index + 1}
                      step={step}
                      position={{ x, y }}
                      cardH={cardH}
                      borderClass={borderClass}
                      onSelect={() => {
                        selected.value = isSelected ? null : index;
                      }}
                      onInsert={() => graphInsertAfter(index)}
                      onBranch={() => graphBranchAfter(index)}
                      onRemove={() => graphRemoveStep(index)}
                      onDragStart={(e) => onDragHandleMouseDown(index, e)}
                    />
                  );
                })}

                {/* Add step (starting step in flat mode) */}
                {(() => {
                  const col0 = flatLayout.colSorted.get(0) ?? [];
                  const lastInCol0 = col0[col0.length - 1];
                  const y = lastInCol0 != null
                    ? (flatLayout.stepY.get(lastInCol0) ?? 0) + cardH / 2 +
                      ROW_GAP
                    : 0;
                  return (
                    <AddStepEl
                      position={{ x: 0, y }}
                      cardH={cardH}
                      onClick={graphAddStart}
                    />
                  );
                })()}
              </div>

              {/* SVG edges */}
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  zIndex: 1,
                  pointerEvents: "none",
                  overflow: "visible",
                }}
                width={flatLayout.svgW}
                height={flatLayout.svgH}
              >
                {flatLayout.edges.map(({ d, active, key, fromIdx, toIdx }) => (
                  <EdgePath
                    key={key}
                    d={d}
                    active={active}
                    color="step"
                    onRemove={() => removeDep(toIdx, fromIdx)}
                  />
                ))}
                {dragLine && (
                  <path
                    d={dragLine}
                    fill="none"
                    stroke="var(--color-orange-500)"
                    stroke-width={2}
                    stroke-dasharray="6 4"
                    opacity={0.7}
                  />
                )}
              </svg>
            </div>
          </div>

          {/* Single end node validation */}
          {flatLayout.leafNodes.length > 1 && (
            <div class="text-xs text-red-600 dark:text-red-400 border-2 border-red-300 dark:border-red-700 p-2">
              Recipe must have a single final step. Currently{" "}
              {flatLayout.leafNodes.length} steps have nothing after them:{" "}
              {flatLayout.leafNodes.map((i) =>
                `#${i + 1} ${steps[i].title.trim() || "untitled"}`
              ).join(", ")}. Connect them or remove extras.
            </div>
          )}
        </div>
      )}

      {/* Legend (shared between flat + nested graph) */}
      {isGraph && sel != null && (
        <div class="flex flex-wrap gap-3 text-xs text-stone-500 mt-2">
          <span>
            <span class="inline-block w-3 h-3 border-2 border-orange-500 mr-1 align-middle" />selected
          </span>
          <span>
            <span class="inline-block w-3 h-3 border-2 border-green-400 mr-1 align-middle" />dependency
          </span>
          <span>
            <span class="inline-block w-3 h-3 border-2 border-blue-300 mr-1 align-middle" />depends
            on selected
          </span>
        </div>
      )}

      {/* Selected-step editor panel (shared between flat + nested graph) */}
      {isGraph && sel != null && steps[sel] && (
        <div class="card p-4 border-orange-300 dark:border-orange-700 border-2 mt-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-sm font-semibold text-stone-500">
              {(() => {
                const dn = nested?.displayNum.get(sel) ?? sel + 1;
                const secIdx = steps[sel].section;
                const secTitle = secIdx != null
                  ? sections.value[secIdx]?.title.trim()
                  : null;
                return secTitle ? `${secTitle} · Step ${dn}` : `Step ${dn}`;
              })()}
            </span>
            <button
              type="button"
              onClick={() => {
                selected.value = null;
              }}
              class="text-stone-400 hover:text-stone-600 ml-auto cursor-pointer"
            >
              <TbX class="size-4" />
            </button>
          </div>
          <StepEditor
            step={steps[sel]}
            index={sel}
            sections={sections.value}
            onTitle={(v) => updateField(sel, "title", v)}
            onBody={(v) => updateField(sel, "body", v)}
            onSection={(idx) => setStepSection(sel, idx)}
            onRemoveMedia={(mi) => removeMedia(sel, mi)}
            onUploadMedia={() => triggerFileUpload(sel)}
            uploading={uploading.value === sel}
          />
        </div>
      )}

      {
        /* Hidden form fields. Drop sections with empty titles and remap step
          indices so the server only sees real ones. */
      }
      {(() => {
        const oldToNewSec = new Map<number, number>();
        const kept: SectionEntry[] = [];
        sections.value.forEach((sec, oldIdx) => {
          if (sec.title.trim()) {
            oldToNewSec.set(oldIdx, kept.length);
            kept.push(sec);
          }
        });
        return (
          <>
            {kept.map((sec, si) => (
              <div key={`hidden-section-${si}`}>
                <input
                  type="hidden"
                  name={`sections[${si}][title]`}
                  value={sec.title}
                />
                <input
                  type="hidden"
                  name={`sections[${si}][key]`}
                  value={sec.key.trim() || slugify(sec.title) ||
                    `section-${si + 1}`}
                />
                <input
                  type="hidden"
                  name={`sections[${si}][after]`}
                  value={sec.after
                    .map((oldIdx) => oldToNewSec.get(oldIdx))
                    .filter((v): v is number => v != null)
                    .join(",")}
                />
              </div>
            ))}
            {steps.map((step, i) => {
              const remappedSec = step.section != null
                ? oldToNewSec.get(step.section) ?? null
                : null;
              return (
                <div key={`hidden-${i}`}>
                  <input
                    type="hidden"
                    name={`steps[${i}][title]`}
                    value={step.title}
                  />
                  <input
                    type="hidden"
                    name={`steps[${i}][body]`}
                    value={step.body}
                  />
                  <input
                    type="hidden"
                    name={`steps[${i}][after]`}
                    value={step.after.join(",")}
                  />
                  <input
                    type="hidden"
                    name={`steps[${i}][section]`}
                    value={remappedSec ?? ""}
                  />
                  {step.media.map((m, mi) => (
                    <input
                      key={m.id}
                      type="hidden"
                      name={`steps[${i}][media][${mi}]`}
                      value={m.id}
                    />
                  ))}
                </div>
              );
            })}
          </>
        );
      })()}
    </div>
  );
}
