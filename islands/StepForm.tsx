import { useSignal } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";
import { IconArrowUp } from "@tabler/icons-preact";
import { IconArrowDown } from "@tabler/icons-preact";
import { IconPlus } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { IconUpload } from "@tabler/icons-preact";
import { IconX } from "@tabler/icons-preact";
import { slugify } from "../utils.ts";
import { Input } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";
import {
  type StepBodyContext,
  StepBodyEditor,
  type StepBodyIngredient,
} from "../components/StepBodyEditor.tsx";
import SegmentToggle from "./SegmentToggle.tsx";

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
  /** True once the user has manually edited the key; stops auto-derive. */
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
  /** Stable id (e.g. an existing DB step id) preserved through edits/reorders. */
  id?: string;
}

interface StepFormProps {
  initialSteps: InitialStep[];
  initialSections?: InitialSection[];
  /** Starting view. The toggle lives in here, so the mode does too. */
  initialMode?: "list" | "graph";
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
/** Right-end spacing inside the graph scroller. Trailing padding on a scroll
 *  container is unreliably included in the scrollable area, so the canvas
 *  width carries it instead; the left end uses plain padding (pl-4). */
const GRAPH_PAD_END = 16;

/** A section's internal step layout, local to its scrollable step area. */
interface SectionInner {
  innerW: number;
  innerH: number;
  stepLocal: Map<number, { x: number; y: number }>;
  addStepLocal: { x: number; y: number };
  stepEdges: GraphLayout["edges"];
}

interface NestedLayout {
  svgW: number;
  svgH: number;
  sectionBoxes: { x: number; y: number; w: number; h: number }[];
  /** Per-section step layout; rendered inside the section's own scroll area. */
  inner: SectionInner[];
  /** Per-section display number for each step (1-based, restarts per section). */
  displayNum: Map<number, number>;
  sectionEdges: GraphLayout["edges"];
}

function computeNestedLayout(
  sections: SectionEntry[],
  steps: StepEntry[],
  cardH: number,
  selStep: number | null,
  selSec: number | null,
  /** Widest a section box may get; wider step DAGs scroll inside the box. */
  maxSectionW: number,
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
    // Map local-index edges to global indices; the path stays in local
    // coordinates since edges render inside the section's own step area.
    const stepEdges = lay.edges.map((e) => ({
      ...e,
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
    return Math.min(
      maxSectionW,
      Math.max(
        SECTION_MIN_W,
        ...idxs.map((i) => internal[i].innerW + 2 * SECTION_PAD_X),
      ),
    );
  });
  const colX: number[] = [];
  let acc = 0;
  for (let c = 0; c <= maxSecCol; c++) {
    colX.push(acc);
    acc += colW[c] + SECTION_GAP;
  }
  const totalW = Math.max(0, acc - SECTION_GAP);

  // Anchor each section vertically to its dependencies. A single dependency
  // top-aligns the box with it, so a chain stays in one horizontal lane
  // (Sauce sits level with Burnt Lemon, not centered in a gap). A section
  // fed by several sections is centered on their combined vertical span, so
  // its edges arrive from above and below instead of all climbing to a box
  // pinned level with the topmost dependency. Sections sharing a column
  // stack downward from their anchors.
  const sectionBoxes = sections.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  let totalH = 0;
  for (let c = 0; c <= maxSecCol; c++) {
    const idxs = [...secInCol[c]];
    const boxHOf = (i: number) =>
      internal[i].innerH + SECTION_PAD_TOP + SECTION_PAD_BOTTOM;
    const desiredTop = (i: number) => {
      const deps = sections[i].after.filter((d) => secCols[d] < c);
      if (deps.length === 0) return 0;
      if (deps.length === 1) return sectionBoxes[deps[0]].y;
      const top = Math.min(...deps.map((d) => sectionBoxes[d].y));
      const bottom = Math.max(
        ...deps.map((d) => sectionBoxes[d].y + sectionBoxes[d].h),
      );
      return Math.max(0, (top + bottom) / 2 - boxHOf(i) / 2);
    };
    if (c > 0) idxs.sort((a, b) => desiredTop(a) - desiredTop(b));
    let curY = 0;
    for (const idx of idxs) {
      const y = Math.max(c > 0 ? desiredTop(idx) : 0, curY);
      const boxH = boxHOf(idx);
      sectionBoxes[idx] = { x: colX[c], y, w: colW[c], h: boxH };
      curY = y + boxH + SECTION_GAP;
      totalH = Math.max(totalH, y + boxH);
    }
  }

  // Section edges between section box borders. Endpoints fan out along the
  // box edge instead of stacking on the vertical midpoint: a section fed by
  // many sections gets a clean fan rather than a knot of overlapping curves.
  // Slots are ordered by the far end's height so the fan never crosses itself.
  const secCenter = (i: number) => sectionBoxes[i].y + sectionBoxes[i].h / 2;
  const incomingOf: number[][] = sections.map((s) =>
    s.after.filter((d) => d >= 0 && d < sections.length)
      .sort((a, b) => secCenter(a) - secCenter(b))
  );
  const outgoingOf: number[][] = sections.map(() => []);
  for (let i = 0; i < sections.length; i++) {
    for (const dep of incomingOf[i]) outgoingOf[dep].push(i);
  }
  for (const list of outgoingOf) {
    list.sort((a, b) => secCenter(a) - secCenter(b));
  }
  const slotY = (box: { y: number; h: number }, slot: number, count: number) =>
    box.y + (box.h * (slot + 1)) / (count + 1);

  const sectionEdges: GraphLayout["edges"] = [];
  for (let i = 0; i < sections.length; i++) {
    for (const dep of incomingOf[i]) {
      const fromBox = sectionBoxes[dep];
      const toBox = sectionBoxes[i];
      const p1x = fromBox.x + fromBox.w;
      const p1y = slotY(
        fromBox,
        outgoingOf[dep].indexOf(i),
        outgoingOf[dep].length,
      );
      const p2x = toBox.x;
      const p2y = slotY(
        toBox,
        incomingOf[i].indexOf(dep),
        incomingOf[i].length,
      );
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
    inner: internal,
    displayNum,
    sectionEdges,
  };
}

// ── Shared graph-card components ──

/**
 * What to call a step in the graph.
 *
 * Titles are optional and nothing suggests they're needed for anything, so the
 * default authoring path produced a graph reading "#1 untitled ⟶ #2 untitled":
 * the one view whose whole purpose is showing which steps run in parallel,
 * with no information in it. Falls back to the opening words of the body,
 * with template directives reduced to the thing they name.
 */
export function stepLabel(
  step: { title: string; body: string },
  maxWords = 6,
): string {
  const title = step.title.trim();
  if (title) return title;

  const plain = step.body
    // `{{ butter }}` / `{{ butter.amount }}` → `butter`
    .replace(
      /\{\{([^}]*)\}\}/g,
      (_m, inner: string) => inner.trim().split(/[.\s(]/)[0] ?? "",
    )
    // `@step(2)`, `@timer(10m)`, `@recipe(slug)` carry nothing readable here.
    .replace(/@\w+\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";

  const words = plain.split(" ");
  return words.length > maxWords
    ? `${words.slice(0, maxWords).join(" ")}…`
    : plain;
}

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
        {(() => {
          const label = stepLabel(step);
          return (
            <span
              class={`font-medium truncate flex-1 min-w-0 ${
                step.title.trim() ? "" : "text-stone-500 dark:text-stone-400"
              }`}
              title={label}
            >
              {label || <span class="text-stone-400 italic">untitled</span>}
            </span>
          );
        })()}
        <div class="flex items-center shrink-0 -mr-1">
          <button
            type="button"
            title="Insert step in sequence"
            aria-label={`Insert a step after step ${displayNum}`}
            class="text-stone-400 hover:text-orange-600 p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onInsert();
            }}
          >
            <IconPlus class="size-3.5" />
          </button>
          <button
            type="button"
            title="Add parallel branch"
            aria-label={`Add a step running in parallel with step ${displayNum}`}
            class="text-stone-400 hover:text-blue-600 p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onBranch();
            }}
          >
            <IconPlus
              class="size-3.5"
              style={{ transform: "rotate(45deg)" }}
            />
          </button>
          <button
            type="button"
            title="Delete step"
            aria-label={`Delete step ${displayNum}`}
            class="text-stone-400 hover:text-red-600 p-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <IconTrash class="size-3.5" />
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
      <IconPlus class="size-3.5 mr-1" />Add starting step
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
    getBodyContext,
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
    getBodyContext: () => StepBodyContext;
  },
) {
  return (
    <div class="space-y-2">
      <Input
        type="text"
        placeholder="Step title"
        value={step.title}
        onValueChange={(v) => onTitle(v)}
        class="w-full font-medium"
        size="sm"
      />
      {sections.length > 0 && (
        <Select
          value={step.section ?? ""}
          onValueChange={(v) => onSection(v === "" ? null : parseInt(v))}
          size="xs"
        >
          <option value="">— no section —</option>
          {sections.map((sec, si) => (
            <option key={sec._uid ?? si} value={si}>
              {sec.title.trim() || `Section ${si + 1}`}
            </option>
          ))}
        </Select>
      )}
      <StepBodyEditor
        placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
        value={step.body}
        onValueChange={(v) => onBody(v)}
        getContext={getBodyContext}
        rows={6}
        class="w-full"
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
                <IconX class="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" class="link text-xs" onClick={onUploadMedia}>
        {uploading ? "Uploading..." : (
          <span>
            <IconUpload class="size-3 inline mr-0.5" />Add images
          </span>
        )}
      </button>
    </div>
  );
}

// ── Main component ──

export default function StepForm(
  { initialSteps, initialSections, initialMode }: StepFormProps,
) {
  // Owned here rather than passed in: the toggle that drives it is rendered
  // below, so handing this out would split one island in two just to fit a
  // line of help text between them.
  const mode = useSignal<"list" | "graph">(initialMode ?? "list");
  const items = useSignal<StepEntry[]>(
    initialSteps.length > 0
      ? (() => {
        // Drop any cross-section step deps from incoming data; step deps must
        // stay intra-section (cross-section ordering lives in section.after).
        const sectionByIdx = initialSteps.map((s) => s.section ?? null);
        return initialSteps.map((s, i) => ({
          ...s,
          section: s.section ?? null,
          after: (s.after ?? []).filter(
            (d) => sectionByIdx[d] === sectionByIdx[i],
          ),
          _uid: s.id ?? crypto.randomUUID(),
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
  const dragStart = useSignal<{ x: number; y: number } | null>(null);
  const dragPos = useSignal<{ x: number; y: number } | null>(null);
  const secSelected = useSignal<number | null>(null);
  const secDragFrom = useSignal<number | null>(null);
  const secDragPos = useSignal<{ x: number; y: number } | null>(null);

  // Measured island width; caps section boxes at 3/4 of the editor so a wide
  // step chain scrolls inside its box instead of blowing up the canvas.
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasW = useSignal(1100);
  // How far the graph canvas may bleed past the island on each side. The page
  // centers content in a max-width column, but the graph scroller wants the
  // whole window edge to edge; measured against the nearest scroll/clip
  // ancestor (<main> on the edit pages, the modal scroller in the agent
  // session). Spacing from the window edge is internal to the scroller
  // (pl-4 + GRAPH_PAD_END), not an outer gutter.
  const bleed = useSignal({ left: 0, right: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let clip: HTMLElement | null = el.parentElement;
    while (clip && clip !== document.body) {
      const s = getComputedStyle(clip);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") break;
      clip = clip.parentElement;
    }
    const update = () => {
      if (el.clientWidth > 0) canvasW.value = el.clientWidth;
      if (!clip) return;
      const rr = el.getBoundingClientRect();
      // Hidden (the steps tab panel is display:none until selected): rects
      // are all zero and would compute a garbage bleed. Keep the last good
      // value; the observer fires again when the panel becomes visible.
      if (rr.width === 0) return;
      const cs = getComputedStyle(clip);
      const cr = clip.getBoundingClientRect();
      const contentL = cr.left + clip.clientLeft + parseFloat(cs.paddingLeft);
      const contentR = cr.left + clip.clientLeft + clip.clientWidth -
        parseFloat(cs.paddingRight);
      bleed.value = {
        left: Math.max(0, Math.round(rr.left - contentL)),
        right: Math.max(0, Math.round(contentR - rr.right)),
      };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (clip) ro.observe(clip);
    return () => ro.disconnect();
  }, []);

  // Validation context for the step-body editor. Ingredient keys live in a
  // sibling island (IngredientForm) so we scrape them from the surrounding
  // form on each invocation; step counts come from our own state.
  const getStepBodyContext = useCallback((): StepBodyContext => {
    const ingredientKeys = new Set<string>();
    const ingredients: StepBodyIngredient[] = [];
    const inputs = typeof document === "undefined"
      ? []
      : document.querySelectorAll<HTMLInputElement>(
        'input[name^="ingredients["][name$="][key]"]',
      );
    inputs.forEach((el) => {
      const k = el.value?.trim();
      if (!k) return;
      ingredientKeys.add(k);
      // The sibling island mirrors each row into hidden inputs, so the name
      // and unit are readable from the same index as the key.
      const idx = el.name.match(/\[(\d+)\]/)?.[1];
      if (idx == null) return;
      const field = (f: string) =>
        document.querySelector<HTMLInputElement>(
          `input[name="ingredients[${idx}][${f}]"]`,
        )?.value?.trim() ?? "";
      ingredients.push({ key: k, name: field("name"), unit: field("unit") });
    });

    const sectionStepCounts = new Map<string, number>();
    for (const sec of sections.value) {
      const key = sec.key?.trim();
      if (!key) continue;
      const count = items.value.filter((s) =>
        sections.value[s.section ?? -1]?.key === key
      ).length;
      sectionStepCounts.set(key, count);
    }
    return {
      ingredientKeys,
      ingredients,
      totalSteps: items.value.length,
      sectionStepCounts,
    };
  }, []);

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
    // Find steps belonging to this section; they get deleted with it.
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

  /**
   * List mode: move a step from its current group into another section
   * (or `null` for loose). `toEnd` = true positions it at the end of the
   * target group (used when moving "up"); false = start (used when moving "down").
   */
  function listMoveStepToGroup(
    stepIdx: number,
    newSection: number | null,
    toEnd: boolean,
  ) {
    const next = [...items.value];
    const [step] = next.splice(stepIdx, 1);
    const moved = { ...step, section: newSection };
    const targetIdxs: number[] = [];
    for (let i = 0; i < next.length; i++) {
      if ((next[i].section ?? null) === newSection) targetIdxs.push(i);
    }
    let insertAt: number;
    if (targetIdxs.length === 0) {
      insertAt = next.length;
    } else if (toEnd) {
      insertAt = targetIdxs[targetIdxs.length - 1] + 1;
    } else {
      insertAt = targetIdxs[0];
    }
    next.splice(insertAt, 0, moved);
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

    const handleEl = e.currentTarget as HTMLElement;
    const container = handleEl.closest(
      "[data-graph-container]",
    ) as HTMLElement;
    if (!container) return;
    dragFrom.value = index;
    const rect = container.getBoundingClientRect();
    // Anchor the line at the handle's on-screen position rather than layout
    // coordinates: cards may live inside a scrolled section step area.
    const hr = handleEl.getBoundingClientRect();
    dragStart.value = {
      x: hr.left + hr.width / 2 - rect.left,
      y: hr.top + hr.height / 2 - rect.top,
    };
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
      dragStart.value = null;
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
  // "all-empty" deps state (that's just default no-info, not an explicit
  // user choice), so the first list→graph switch keeps the linear chain.
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
  // Flat layout (no sections): used when sections aren't in play
  const flatLayout = isGraph && !hasSections
    ? computeGraphLayout(steps, sel, cardH)
    : null;
  // Nested layout (sections as containers): used when sections exist
  const nested = isGraph && hasSections
    ? computeNestedLayout(
      sections.value,
      steps,
      cardH,
      sel,
      secSelected.value,
      Math.max(
        SECTION_MIN_W,
        Math.floor(
          (canvasW.value + bleed.value.left + bleed.value.right) * 0.75,
        ),
      ),
    )
    : null;

  const selDeps = new Set(sel != null ? steps[sel]?.after ?? [] : []);
  const selDependents = new Set<number>();
  if (sel != null) {
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].after.includes(sel)) selDependents.add(i);
    }
  }

  // Same highlight semantics for sections as for steps: green for what the
  // selected section depends on, blue for what depends on it.
  const secSel = secSelected.value;
  const secSelDeps = new Set(
    secSel != null ? sections.value[secSel]?.after ?? [] : [],
  );
  const secDependents = new Set<number>();
  if (secSel != null) {
    for (let i = 0; i < sections.value.length; i++) {
      if (sections.value[i].after.includes(secSel)) secDependents.add(i);
    }
  }

  // Live step drag line: anchored at the handle's measured position, which
  // holds up in both flat and nested mode (including scrolled step areas).
  const dragLine = (() => {
    if (dragFrom.value == null || !dragStart.value || !dragPos.value) {
      return null;
    }
    const p1 = dragStart.value;
    const p2 = dragPos.value;
    const dx = Math.abs(p2.x - p1.x) * 0.4;
    return `M${p1.x},${p1.y} C${p1.x + dx},${p1.y} ${
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
    <div class="space-y-4" ref={rootRef}>
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-stone-500 dark:text-stone-400">
          Use <code class="code-hint">{"{{ key }}"}</code>{" "}
          for scaled ingredients,{" "}
          <code class="code-hint">{"{{ key.amount }}"}</code>{" "}
          for just the number. Supports math and functions.{" "}
          <a href="/docs/templates" class="link text-xs">Full reference</a>
        </p>
        <SegmentToggle value={mode} options={["list", "graph"]} />
      </div>

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

        // Visible groups in render order. Loose group is included only if it
        // has any steps; sections are always visible (so user can drop steps
        // into empty sections via up/down on a boundary step).
        const allGroups: { section: number | null; stepIdxs: number[] }[] = [];
        if (looseStepIdxs.length > 0) {
          allGroups.push({ section: null, stepIdxs: looseStepIdxs });
        }
        sections.value.forEach((_, sIdx) => {
          allGroups.push({ section: sIdx, stepIdxs: stepsBySection[sIdx] });
        });

        function renderStepCard(
          i: number,
          displayN: number,
          group: number[],
          posInGroup: number,
          groupIdx: number,
        ) {
          const atTop = posInGroup === 0;
          const atBottom = posInGroup === group.length - 1;
          const prevGroup = groupIdx > 0 ? allGroups[groupIdx - 1] : null;
          const nextGroup = groupIdx < allGroups.length - 1
            ? allGroups[groupIdx + 1]
            : null;
          const upDisabled = atTop && prevGroup == null;
          const downDisabled = atBottom && nextGroup == null;
          const item = steps[i];
          return (
            <div key={item._uid ?? i} class="form-row space-y-2">
              <div class="flex flex-wrap sm:flex-nowrap gap-2 items-center min-w-0">
                <span class="text-xs text-stone-400 font-mono shrink-0 max-sm:order-1">
                  #{displayN}
                </span>
                <Input
                  type="text"
                  placeholder="Step title"
                  value={item.title}
                  onValueChange={(v) => updateField(i, "title", v)}
                  class="flex-1 min-w-0 font-medium max-sm:order-3 max-sm:basis-full"
                  size="sm"
                />
                <div class="flex items-center gap-1 shrink-0 max-sm:order-2 max-sm:ml-auto">
                  <button
                    type="button"
                    disabled={upDisabled}
                    title={atTop ? "Move to previous section" : "Move up"}
                    class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                    onClick={() => {
                      if (upDisabled) return;
                      if (atTop) {
                        listMoveStepToGroup(i, prevGroup!.section, true);
                      } else {
                        listSwapSteps(i, group[posInGroup - 1]);
                      }
                    }}
                  >
                    <IconArrowUp class="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={downDisabled}
                    title={atBottom ? "Move to next section" : "Move down"}
                    class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                    onClick={() => {
                      if (downDisabled) return;
                      if (atBottom) {
                        listMoveStepToGroup(i, nextGroup!.section, false);
                      } else {
                        listSwapSteps(i, group[posInGroup + 1]);
                      }
                    }}
                  >
                    <IconArrowDown class="size-4" />
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
                    <IconTrash class="size-4" />
                  </button>
                </div>
              </div>
              <StepBodyEditor
                placeholder="Step body (markdown, use {{ ingredient_key }} for scaled amounts)"
                value={item.body}
                onValueChange={(v) => updateField(i, "body", v)}
                getContext={getStepBodyContext}
                rows={6}
                class="w-full"
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
                        <IconX class="size-3" />
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
                    <IconUpload class="size-3 inline mr-0.5" />Add images
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
                  renderStepCard(i, n + 1, looseStepIdxs, n, 0)
                )}
                {sections.value.length === 0 && (
                  <button
                    type="button"
                    onClick={() => listAddStep(null)}
                    class="link text-sm font-medium"
                  >
                    <IconPlus class="size-3.5 inline mr-1" />Add step
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
                    <Input
                      type="text"
                      placeholder="Section title"
                      value={sec.title}
                      onValueChange={(v) => updateSectionTitle(sIdx, v)}
                      class="flex-1 font-bold min-w-0"
                    />
                    <Input
                      type="text"
                      placeholder="key"
                      value={sec.key}
                      onValueChange={(v) => updateSectionKey(sIdx, v)}
                      class="w-32 shrink-0"
                      size="xs"
                      monospace
                      title="Used in @step(key.N) references"
                    />
                    <button
                      type="button"
                      disabled={sIdx === 0}
                      class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                      onClick={() => moveSection(sIdx, -1)}
                    >
                      <IconArrowUp class="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={sIdx === sections.value.length - 1}
                      class="text-stone-400 hover:text-stone-600 disabled:opacity-30 p-1 cursor-pointer disabled:cursor-default"
                      onClick={() => moveSection(sIdx, 1)}
                    >
                      <IconArrowDown class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="text-red-600 hover:text-red-700 p-1 cursor-pointer"
                      onClick={() => removeSection(sIdx)}
                    >
                      <IconTrash class="size-4" />
                    </button>
                  </div>
                  {group.length > 0 && (
                    <div class="space-y-3">
                      {group.map((i, n) =>
                        renderStepCard(
                          i,
                          n + 1,
                          group,
                          n,
                          (looseStepIdxs.length > 0 ? 1 : 0) + sIdx,
                        )
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => listAddStep(sIdx)}
                    class="link text-sm font-medium"
                  >
                    <IconPlus class="size-3.5 inline mr-1" />Add step
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
              <IconPlus class="size-3.5 inline mr-1" />Add section
            </button>
          </div>
        );
      })()}

      {/* ── Nested graph (sections containing steps) ── */}
      {isGraph && nested && (
        <div
          class="overflow-x-auto pb-2 pl-4 select-none"
          style={{
            marginLeft: `${-bleed.value.left}px`,
            marginRight: `${-bleed.value.right}px`,
          }}
        >
          <div
            data-graph-container
            data-section-graph-container
            style={{
              position: "relative",
              width: `${nested.svgW + 4 + GRAPH_PAD_END}px`,
              minHeight: `${nested.svgH + SECTION_GAP + 56 + ROW_GAP}px`,
            }}
          >
            {
              /* Section bounding boxes. No z-index on the box itself, so its
              header/steps children can stack above the section-edge SVG. */
            }
            {(() => {
              return sections.value.map((sec, sIdx) => {
                const box = nested.sectionBoxes[sIdx];
                const innerL = nested.inner[sIdx];
                if (!box || !innerL) {
                  return null;
                }
                const isSelected = secSelected.value === sIdx;
                const isDragSrc = secDragFrom.value === sIdx;
                const borderClass = isDragSrc
                  ? "border-orange-400 ring-2 ring-orange-200 dark:ring-orange-800"
                  : isSelected
                  ? "border-orange-500 ring-2 ring-orange-200 dark:ring-orange-800"
                  : secSelDeps.has(sIdx)
                  ? "border-green-400 dark:border-green-600"
                  : secDependents.has(sIdx)
                  ? "border-blue-300 dark:border-blue-700"
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
                    <div class="relative z-[2] px-2 pt-2 pb-1 flex items-center gap-1 min-w-0">
                      <Input
                        type="text"
                        placeholder="Section title"
                        value={sec.title}
                        onClick={(e) => e.stopPropagation()}
                        onValueChange={(v) => updateSectionTitle(sIdx, v)}
                        class="flex-1 min-w-0 font-bold select-text"
                      />
                      <Input
                        type="text"
                        placeholder="key"
                        value={sec.key}
                        onClick={(e) => e.stopPropagation()}
                        onValueChange={(v) => updateSectionKey(sIdx, v)}
                        title="Used in @step(key.N) references"
                        class="w-32 shrink-0 select-text"
                        size="xs"
                        monospace
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
                          <IconPlus class="size-3.5" />
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
                          <IconPlus
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
                          <IconTrash class="size-3.5" />
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
                    {
                      /* The section's step DAG, scrolling horizontally inside
                      the box when wider than the (capped) box width. */
                    }
                    <div
                      style={{
                        position: "absolute",
                        left: `${SECTION_PAD_X}px`,
                        top: `${SECTION_PAD_TOP}px`,
                        width: `${box.w - 2 * SECTION_PAD_X}px`,
                        height: `${
                          box.h - SECTION_PAD_TOP - SECTION_PAD_BOTTOM
                        }px`,
                        zIndex: 2,
                      }}
                      class="overflow-x-auto overflow-y-hidden"
                    >
                      <div
                        style={{
                          position: "relative",
                          width: `${innerL.innerW}px`,
                          height: `${innerL.innerH}px`,
                        }}
                      >
                        <svg
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            pointerEvents: "none",
                            overflow: "visible",
                          }}
                          width={innerL.innerW}
                          height={innerL.innerH}
                        >
                          {innerL.stepEdges.map(
                            ({ d, active, key, fromIdx, toIdx }) => (
                              <EdgePath
                                key={`step-${key}`}
                                d={d}
                                active={active}
                                color="step"
                                onRemove={() => removeDep(toIdx, fromIdx)}
                              />
                            ),
                          )}
                        </svg>
                        {steps.map((step, index) => {
                          const tl = innerL.stepLocal.get(index);
                          if (!tl) {
                            return null;
                          }
                          const isSelectedStep = sel === index;
                          const stepBorder = dragFrom.value === index
                            ? "border-orange-400 ring-2 ring-orange-200 dark:ring-orange-800"
                            : isSelectedStep
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
                              displayNum={nested.displayNum.get(index) ??
                                index + 1}
                              step={step}
                              position={tl}
                              cardH={cardH}
                              borderClass={stepBorder}
                              onSelect={(e) => {
                                e.stopPropagation();
                                selected.value = isSelectedStep ? null : index;
                              }}
                              onInsert={() => graphInsertAfter(index)}
                              onBranch={() => graphBranchAfter(index)}
                              onRemove={() => graphRemoveStep(index)}
                              onDragStart={(e) =>
                                onDragHandleMouseDown(index, e)}
                            />
                          );
                        })}
                        <AddStepEl
                          position={innerL.addStepLocal}
                          cardH={cardH}
                          onClick={() => graphAddStartInSection(sIdx)}
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}

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
                  <IconPlus class="size-4 mr-1" />Add starting section
                </div>
              );
            })()}

            {/* Section dependency edges */}
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
            </svg>
            {/* Live drag lines, above everything */}
            {(dragLine || secDragLine) && (
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  zIndex: 5,
                  pointerEvents: "none",
                  overflow: "visible",
                }}
                width={nested.svgW}
                height={nested.svgH}
              >
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
            )}
          </div>
        </div>
      )}

      {/* Single-ending-section validation (nested graph) */}
      {isGraph && nested && (() => {
        const leafSecs = sections.value
          .map((_, i) => i)
          .filter((i) =>
            !sections.value.some((s) => (s.after ?? []).includes(i))
          );
        if (leafSecs.length <= 1) return null;
        return (
          <div class="text-xs text-red-600 dark:text-red-400 border-2 border-red-300 dark:border-red-700 p-2">
            Recipe must have a single final section. Currently {leafSecs.length}
            {" "}
            sections have nothing after them: {leafSecs.map((i) =>
              sections.value[i].title.trim() || `Section ${i + 1}`
            ).join(", ")}. Connect them or remove extras.
          </div>
        );
      })()}

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
              <IconPlus class="size-3 inline mr-0.5" />Add section
            </button>
          </div>
          <div
            class="overflow-x-auto pb-2 pl-4 select-none"
            style={{
              marginLeft: `${-bleed.value.left}px`,
              marginRight: `${-bleed.value.right}px`,
            }}
          >
            <div
              data-graph-container
              style={{
                position: "relative",
                width: `${flatLayout.svgW + GRAPH_PAD_END}px`,
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
                `#${i + 1} ${stepLabel(steps[i]) || "untitled"}`
              ).join(", ")}. Connect them or remove extras.
            </div>
          )}
        </div>
      )}

      {/* Legend (shared between flat + nested graph, steps and sections) */}
      {isGraph && (sel != null || secSelected.value != null) && (
        <div class="flex flex-wrap gap-3 text-xs text-stone-500 mt-2 select-none">
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
              <IconX class="size-4" />
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
            getBodyContext={getStepBodyContext}
          />
        </div>
      )}

      {/* Selected-section editor panel (nested graph) */}
      {isGraph && nested && secSel != null && sections.value[secSel] &&
        (() => {
          const sec = sections.value[secSel];
          const secSteps = steps
            .map((_, i) => i)
            .filter((i) => steps[i].section === secSel);
          return (
            <div class="card p-4 border-orange-300 dark:border-orange-700 border-2 mt-4">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-semibold text-stone-500">
                  {sec.title.trim() || `Section ${secSel + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    secSelected.value = null;
                  }}
                  class="text-stone-400 hover:text-stone-600 ml-auto cursor-pointer"
                >
                  <IconX class="size-4" />
                </button>
              </div>
              <div class="flex items-center gap-2 mb-3">
                <Input
                  type="text"
                  placeholder="Section title"
                  value={sec.title}
                  onValueChange={(v) => updateSectionTitle(secSel, v)}
                  class="flex-1 font-bold min-w-0"
                />
                <Input
                  type="text"
                  placeholder="key"
                  value={sec.key}
                  onValueChange={(v) => updateSectionKey(secSel, v)}
                  class="w-32 shrink-0"
                  size="xs"
                  monospace
                  title="Used in @step(key.N) references"
                />
              </div>
              {secSteps.length === 0 && (
                <div class="text-xs text-stone-400 italic">
                  No steps in this section yet.
                </div>
              )}
              <div class="space-y-3">
                {secSteps.map((i) => (
                  <div
                    key={steps[i]._uid ?? i}
                    class="border-t-2 border-stone-200 dark:border-stone-700 pt-3"
                  >
                    <div class="text-xs font-semibold text-stone-500 mb-1.5">
                      Step {nested.displayNum.get(i) ?? i + 1}
                    </div>
                    <StepEditor
                      step={steps[i]}
                      index={i}
                      sections={sections.value}
                      onTitle={(v) => updateField(i, "title", v)}
                      onBody={(v) => updateField(i, "body", v)}
                      onSection={(idx) => setStepSection(i, idx)}
                      onRemoveMedia={(mi) => removeMedia(i, mi)}
                      onUploadMedia={() => triggerFileUpload(i)}
                      uploading={uploading.value === i}
                      getBodyContext={getStepBodyContext}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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
                    name={`steps[${i}][id]`}
                    value={step._uid ?? ""}
                  />
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
