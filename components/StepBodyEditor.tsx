/** @jsxRuntime automatic */
/** @jsxImportSource preact */

/**
 * `<textarea>`-like editor for recipe step bodies that highlights template
 * syntax inline. Backed by `@luca/highlightable-textarea` (a controlled
 * `contenteditable="plaintext-only"` div + CSS Custom Highlights).
 *
 * Highlight categories (mapped to `::highlight(<label>)` rules in styles.css):
 *   - `tpl-syntax`     punctuation of a directive (`{{`, `}}`, `@step(`, `)`).
 *   - `tpl-interp`     a successful `{{ … }}` interpolation expression body.
 *   - `tpl-step-ref`   an `@step(…)` or section-relative step reference.
 *   - `tpl-timer`      an `@timer(…)` directive.
 *   - `tpl-recipe`     an `@recipe(…)` directive.
 *   - `tpl-invalid`    anything the parser flagged as invalid OR a directive
 *                      whose argument doesn't resolve (unknown ingredient
 *                      key, out-of-range step, missing section, …).
 *
 * Validation context (which ingredient keys, step numbers, and section keys
 * are valid) is supplied by the caller via `getContext`. It is invoked on
 * every keystroke so the editor stays in sync with sibling forms (the
 * ingredient list and section list are managed by separate islands).
 *
 * Errors emitted during tokenisation carry a human-readable `message`. On
 * mouseover we map the cursor position to a text offset via
 * `caretPositionFromPoint` / `caretRangeFromPoint`, look up the covering
 * error, and surface its message in a positioned tooltip.
 */

import {
  HighlightableTextarea,
  type HighlightToken,
} from "@luca/highlightable-textarea";
import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import type { ComponentChildren, JSX } from "preact";
import { parseTemplate } from "../lib/recipe-template/parser.ts";
import { registerErrorTracker } from "../lib/recipe-errors.ts";
import type {
  Expr,
  StepRefGlobalNode,
  StepRefSectionNode,
  TemplateAst,
  TemplateNode,
} from "../lib/recipe-template/ast.ts";

/** Information the highlighter needs to flag semantic errors. */
export interface StepBodyContext {
  /** Ingredient keys defined elsewhere in the form (e.g. `flour`, `sugar`). */
  ingredientKeys: Set<string>;
  /** Number of steps total — used to validate `@step(N)` references. */
  totalSteps: number;
  /** Map of section key → number of steps in that section. */
  sectionStepCounts: Map<string, number>;
}

export interface StepBodyEditorProps {
  value: string;
  onValueChange(value: string): void;
  /**
   * Called fresh on every highlight pass. Must be cheap — re-runs on every
   * keystroke. Memoize the returned object if it doesn't change.
   */
  getContext(): StepBodyContext;
  rows?: number;
  placeholder?: string;
  class?: string;
}

/** Diagnostic emitted alongside a `tpl-invalid` highlight. */
export interface StepBodyDiagnostic {
  start: number;
  end: number;
  message: string;
}

const BUILTINS = new Set(["round", "ceil", "floor", "min", "max", "abs"]);

export function StepBodyEditor(props: StepBodyEditorProps): JSX.Element {
  const { value, onValueChange, getContext, rows = 6 } = props;

  // Diagnostics are produced as a side-effect of the highlight pass. Stored
  // as a signal so the JSX (red outline + error badge + popup) re-renders
  // when the error set changes, and also as a ref so synchronous handlers
  // (hover tooltip) can read the current set without subscribing.
  const diagnostics = useSignal<StepBodyDiagnostic[]>([]);
  const diagnosticsRef = useRef<StepBodyDiagnostic[]>([]);

  const highlight = useMemo(
    () => (text: string) => {
      const { tokens, diagnostics: d } = collect(text, getContext());
      diagnosticsRef.current = d;
      diagnostics.value = d;
      trackerRef.current?.update(d.length);
      return tokens;
    },
    [getContext],
  );

  /** Whether the "show errors" popup is open. */
  const popupOpen = useSignal(false);

  // Publish this editor's error count to the cross-island signal so the
  // Save / Preview buttons elsewhere can disable themselves when anything
  // is broken.
  const trackerRef = useRef<ReturnType<typeof registerErrorTracker> | null>(
    null,
  );
  if (trackerRef.current === null) trackerRef.current = registerErrorTracker();
  useEffect(() => () => trackerRef.current?.unregister(), []);

  /**
   * Tooltip state. Anchored to the *start* of the diagnostic range (not the
   * cursor) so it's stable while the user moves around within the same
   * error — feels much more like a code-editor hover popover.
   */
  const tooltip = useSignal<
    { left: number; top: number; message: string; key: number } | null
  >(null);

  /** Last known mouse position, kept across renders so we can re-evaluate
   *  the tooltip after the value changes (diagnostics may shift, disappear,
   *  or be replaced under a stationary cursor). */
  const lastMouseRef = useRef<
    { x: number; y: number; target: HTMLDivElement } | null
  >(null);

  function recomputeTooltip(): void {
    const m = lastMouseRef.current;
    if (!m) {
      if (tooltip.value) tooltip.value = null;
      return;
    }
    const offset = caretOffsetFromPoint(m.target, m.x, m.y);
    if (offset == null) {
      if (tooltip.value) tooltip.value = null;
      return;
    }
    const err = diagnosticsRef.current.find(
      (d) => offset >= d.start && offset < d.end,
    );
    if (!err) {
      if (tooltip.value) tooltip.value = null;
      return;
    }
    const rect = offsetToRect(m.target, err.start);
    if (!rect) return;
    const next = {
      left: rect.left,
      top: rect.bottom + 4,
      message: err.message,
      key: err.start,
    };
    const cur = tooltip.value;
    if (
      cur && cur.key === next.key && cur.message === next.message &&
      cur.left === next.left && cur.top === next.top
    ) return;
    tooltip.value = next;
  }

  // After the package re-runs `doHighlight` (its own `useLayoutEffect` keyed
  // on `[value, highlight]`), `diagnosticsRef` is fresh. Our useLayoutEffect
  // runs immediately after the child's, so re-evaluate the tooltip against
  // the new diagnostics + new text layout while still under the same mouse.
  useLayoutEffect(() => {
    recomputeTooltip();
  }, [value]);

  const onMouseMove = (e: MouseEvent) => {
    lastMouseRef.current = {
      x: e.clientX,
      y: e.clientY,
      target: e.currentTarget as HTMLDivElement,
    };
    recomputeTooltip();
  };

  const onMouseLeave = () => {
    lastMouseRef.current = null;
    if (tooltip.value) tooltip.value = null;
  };

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close popup on Escape — the backdrop handles outside-click directly.
  useEffect(() => {
    if (!popupOpen.value) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") popupOpen.value = false;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popupOpen.value]);

  const hasErrors = diagnostics.value.length > 0;
  const minHeight = `${rows * 1.5}rem`;
  const cls = [
    "step-body-editor",
    "block w-full font-mono whitespace-pre-wrap break-words",
    "border-2 bg-stone-100 dark:bg-stone-800",
    hasErrors
      ? "border-red-600 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500"
      : "border-stone-300 dark:border-stone-700 focus:border-orange-600 dark:focus:border-orange-500",
    "text-stone-900 dark:text-stone-100 text-sm leading-normal px-3 py-2",
    "transition-colors duration-75 focus:outline-none",
    props.class,
  ].filter(Boolean).join(" ");

  return (
    <div class="step-body-editor-wrapper relative" ref={wrapperRef}>
      <HighlightableTextarea
        value={value}
        highlight={highlight}
        onInput={(e: Event) => {
          onValueChange((e.currentTarget as HTMLDivElement).textContent ?? "");
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        aria-placeholder={props.placeholder}
        style={{ minHeight, boxSizing: "border-box" }}
        class={cls}
      />
      {hasErrors && (
        <button
          type="button"
          data-step-body-error-badge
          class="step-body-error-badge"
          aria-label={`${diagnostics.value.length} error${
            diagnostics.value.length === 1 ? "" : "s"
          } — click to view`}
          aria-expanded={popupOpen.value}
          onMouseDown={(e) => {
            // Prevent the contenteditable from stealing focus before our
            // click handler runs (otherwise the focus-shift can race the
            // popup toggle).
            e.preventDefault();
          }}
          onClick={() => {
            popupOpen.value = !popupOpen.value;
          }}
        >
          <ErrorTriangleIcon />
          <span class="step-body-error-badge-count">
            {diagnostics.value.length}
          </span>
        </button>
      )}
      {hasErrors && popupOpen.value && (
        <div
          class="step-body-error-popup-backdrop"
          data-step-body-error-popup
          onClick={(e) => {
            if (e.target === e.currentTarget) popupOpen.value = false;
          }}
        >
          <div
            class="step-body-error-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Errors in this step"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="step-body-error-popup-header">
              <span class="step-body-error-popup-title">
                {diagnostics.value.length}{" "}
                problem{diagnostics.value.length === 1 ? "" : "s"} found
              </span>
              <button
                type="button"
                class="step-body-error-popup-close"
                aria-label="Close"
                onClick={() => {
                  popupOpen.value = false;
                }}
              >
                <CloseIcon />
              </button>
            </div>
            <ul class="step-body-error-popup-list">
              {diagnostics.value.map((d, i) => (
                <li key={`${d.start}-${i}`} class="step-body-error-popup-item">
                  <code class="step-body-error-popup-snippet">
                    <ContextSnippet source={value} diagnostic={d} />
                  </code>
                  <div class="step-body-error-popup-message">
                    {renderMessage(d.message)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {tooltip.value && (
        <div
          class="step-body-tooltip"
          role="tooltip"
          style={{
            position: "fixed",
            left: `${tooltip.value.left}px`,
            top: `${tooltip.value.top}px`,
          }}
        >
          <span class="step-body-tooltip-icon" aria-hidden="true">●</span>
          <span class="step-body-tooltip-msg">
            {renderMessage(tooltip.value.message)}
          </span>
        </div>
      )}
    </div>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 6 L18 18 M18 6 L6 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

function ErrorTriangleIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2 L22 21 H2 Z"
        fill="currentColor"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path
        d="M12 9 V14"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="12" cy="17" r="1.1" fill="white" />
    </svg>
  );
}

function ContextSnippet(
  { source, diagnostic }: { source: string; diagnostic: StepBodyDiagnostic },
): JSX.Element {
  const CTX = 18;
  const beforeStart = Math.max(0, diagnostic.start - CTX);
  const afterEnd = Math.min(source.length, diagnostic.end + CTX);
  const leadEllipsis = beforeStart > 0 ? "…" : "";
  const tailEllipsis = afterEnd < source.length ? "…" : "";
  const before = source.slice(beforeStart, diagnostic.start).replace(
    /\n/g,
    "↵",
  );
  const errPart = source.slice(diagnostic.start, diagnostic.end).replace(
    /\n/g,
    "↵",
  ) || "·";
  const after = source.slice(diagnostic.end, afterEnd).replace(/\n/g, "↵");
  return (
    <>
      {leadEllipsis}
      {before}
      <mark class="step-body-error-popup-mark">{errPart}</mark>
      {after}
      {tailEllipsis}
    </>
  );
}

// ── Tooltip message rendering ─────────────────────────────────────────────

/**
 * Render a plain-string error message into JSX, turning `` `code` `` segments
 * into `<code>` for monospace inline display. The surrounding text stays
 * sans-serif so the prose reads naturally.
 */
function renderMessage(text: string): ComponentChildren {
  const parts: ComponentChildren[] = [];
  let i = 0;
  let last = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close < 0) break;
      if (i > last) parts.push(text.slice(last, i));
      parts.push(<code key={i}>{text.slice(i + 1, close)}</code>);
      i = close + 1;
      last = i;
    } else {
      i++;
    }
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ── Text offset → screen rect ─────────────────────────────────────────────

/**
 * Find the viewport rect of the caret position at character offset `offset`
 * within `root.textContent`. Used to anchor the tooltip to the *start* of
 * an error so it stays put as the user hovers around within the diagnostic.
 *
 * Implementation note: collapsed `Range`s (`setStart === setEnd`) return
 * `(0,0,0,0)` from `getBoundingClientRect` in several browsers, which
 * would place the tooltip at the viewport top-left. We always measure a
 * non-empty range (the surrounding character) and derive the caret edge
 * from it.
 */
function offsetToRect(root: HTMLElement, offset: number): DOMRect | null {
  let remaining = offset;
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const node = child as Text;
      const len = node.data.length;
      if (remaining <= len) return measureAt(node, remaining);
      remaining -= len;
    } else if ((child as Element).tagName === "BR") {
      if (remaining === 0) {
        const r = document.createRange();
        r.selectNode(child);
        return r.getBoundingClientRect();
      }
      remaining -= 1;
    } else {
      const len = (child.textContent ?? "").length;
      if (remaining <= len) {
        return (child as Element).getBoundingClientRect();
      }
      remaining -= len;
    }
  }
  // Offset past end — anchor to the end of the last text node, else root.
  const last = root.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    const t = last as Text;
    if (t.data.length > 0) return measureAt(t, t.data.length);
  }
  return root.getBoundingClientRect();
}

/**
 * Get the caret position at `offset` within text node `node`.
 *
 * The preferred measurement is a *collapsed* range — its bounding rect is
 * the caret rect, which spans the full line-box height. That's exactly the
 * shape we want for anchoring a tooltip at the *bottom of the line* under
 * the diagnostic. Measuring a 1-character range instead returns the glyph
 * box (which is shorter than the line box), so `rect.bottom` lands inside
 * the line instead of below it.
 *
 * Some browsers return `(0,0,0,0)` from a collapsed range at offset 0 of a
 * freshly-mounted text node. We detect that and fall back to measuring the
 * adjacent character, which is the best we can do without the caret rect.
 */
function measureAt(node: Text, offset: number): DOMRect {
  const len = node.data.length;
  const r = document.createRange();
  r.setStart(node, offset);
  r.setEnd(node, offset);
  const caret = r.getBoundingClientRect();
  if (caret.height > 0) return caret;

  // Fallback: browser returned a zero rect. Measure a neighbour character.
  if (len === 0) return caret;
  if (offset < len) {
    r.setStart(node, offset);
    r.setEnd(node, offset + 1);
    return r.getBoundingClientRect();
  }
  r.setStart(node, len - 1);
  r.setEnd(node, len);
  const rect = r.getBoundingClientRect();
  return new DOMRect(rect.right, rect.top, 0, rect.height);
}

// ── Cursor → text offset ──────────────────────────────────────────────────

/**
 * Map a viewport (`clientX`, `clientY`) point to a character offset within
 * `root.textContent`. Returns null if the point isn't over text inside
 * `root`. Works on both Gecko (`caretPositionFromPoint`) and Blink/WebKit
 * (`caretRangeFromPoint`).
 */
function caretOffsetFromPoint(
  root: HTMLElement,
  x: number,
  y: number,
): number | null {
  let node: Node | null = null;
  let offsetInNode = 0;

  // deno-lint-ignore no-explicit-any
  const fromPos = (document as any).caretPositionFromPoint as
    | ((x: number, y: number) => { offsetNode: Node; offset: number } | null)
    | undefined;
  if (typeof fromPos === "function") {
    const pos = fromPos.call(document, x, y);
    if (!pos) return null;
    node = pos.offsetNode;
    offsetInNode = pos.offset;
    // `caretRangeFromPoint` is the WebKit/Blink equivalent of
    // `caretPositionFromPoint` and is the only option there until
    // `caretPositionFromPoint` ships universally.
  } else if (typeof document.caretRangeFromPoint === "function") {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer;
    offsetInNode = r.startOffset;
  } else {
    return null;
  }
  if (!node || !root.contains(node)) return null;

  // Walk text/`<br>` siblings in document order, summing lengths until we
  // reach `node`. Mirrors the package's own `locationizeTokens` traversal.
  let total = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === node) return total + offsetInNode;
    if (child.nodeType === Node.TEXT_NODE) {
      total += (child as Text).data.length;
    } else if ((child as Element).tagName === "BR") {
      total += 1; // browsers represent <br> as '\n' in textContent.
    } else {
      total += (child.textContent ?? "").length;
    }
  }
  // `node` was the root itself (caret between children). Treat
  // `offsetInNode` as a child index and sum lengths up to that index.
  if (node === root) {
    let acc = 0;
    for (let i = 0; i < offsetInNode && i < root.childNodes.length; i++) {
      const c = root.childNodes[i];
      acc += (c.textContent ?? "").length;
    }
    return acc;
  }
  return null;
}

// ── Token + diagnostic collection ─────────────────────────────────────────

interface CollectResult {
  tokens: HighlightToken[];
  diagnostics: StepBodyDiagnostic[];
}

function collect(source: string, ctx: StepBodyContext): CollectResult {
  const ast = parseTemplate(source);
  const tokens: HighlightToken[] = [];
  const diagnostics: StepBodyDiagnostic[] = [];
  for (const node of ast.nodes) emitNode(node, ctx, tokens, diagnostics);
  return { tokens, diagnostics };
}

function emitNode(
  node: TemplateNode,
  ctx: StepBodyContext,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  switch (node.kind) {
    case "text":
      return;
    case "invalid_directive":
      pushInvalid(tokens, diagnostics, node.start, node.length, node.message);
      return;
    case "interpolation":
      pushToken(tokens, node.start, 2, "tpl-syntax", 1);
      pushToken(tokens, node.start + node.length - 2, 2, "tpl-syntax", 1);
      emitExpr(node.expr, ctx, tokens, diagnostics);
      return;
    case "step_ref": {
      emitStepRef(node, ctx, tokens, diagnostics);
      return;
    }
    case "step_ref_section": {
      emitSectionStepRef(node, ctx, tokens, diagnostics);
      return;
    }
    case "timer":
      // Invalid/zero durations are flagged as `invalid_directive` by the
      // parser, so by the time we see a `timer` node it's always valid.
      pushToken(tokens, node.start, node.length, "tpl-timer", 2);
      return;
    case "recipe_ref":
      pushToken(tokens, node.start, node.length, "tpl-recipe", 2);
      return;
  }
}

function emitStepRef(
  node: StepRefGlobalNode,
  ctx: StepBodyContext,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  if (node.number < 1 || node.number > ctx.totalSteps) {
    pushInvalid(
      tokens,
      diagnostics,
      node.start,
      node.length,
      ctx.totalSteps === 0
        ? "There aren't any steps in this recipe yet, " +
          "so there's nothing to link to."
        : `There's no step ${node.number} — this recipe has ${ctx.totalSteps} ` +
          `step${ctx.totalSteps === 1 ? "" : "s"} in total.`,
    );
    return;
  }
  pushToken(tokens, node.start, node.length, "tpl-step-ref", 2);
}

function emitSectionStepRef(
  node: StepRefSectionNode,
  ctx: StepBodyContext,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  const count = ctx.sectionStepCounts.get(node.sectionKey);
  if (count == null) {
    pushInvalid(
      tokens,
      diagnostics,
      node.start,
      node.length,
      `There's no section called \`${node.sectionKey}\`. ` +
        "Check the section name above — it should match exactly " +
        "(lowercase, no spaces).",
    );
    return;
  }
  if (node.number < 1 || node.number > count) {
    pushInvalid(
      tokens,
      diagnostics,
      node.start,
      node.length,
      `The \`${node.sectionKey}\` section only has ${count} step${
        count === 1 ? "" : "s"
      }, so there's no step ${node.number} there.`,
    );
    return;
  }
  pushToken(tokens, node.start, node.length, "tpl-step-ref", 2);
}

function emitExpr(
  expr: Expr,
  ctx: StepBodyContext,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  switch (expr.kind) {
    case "invalid_expr":
      pushInvalid(tokens, diagnostics, expr.start, expr.length, expr.message);
      return;
    case "number":
      pushToken(tokens, expr.start, expr.length, "tpl-number", 1);
      return;
    case "variable": {
      const known = ctx.ingredientKeys.has(expr.name) ||
        ctx.ingredientKeys.has(lowerFirst(expr.name)) ||
        expr.name === "ratio";
      if (!known) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.start,
          expr.length,
          `There's no ingredient called \`${expr.name}\`. ` +
            "Add it to the ingredients list above, " +
            "or check that the spelling matches.",
        );
        return;
      }
      pushToken(tokens, expr.start, expr.length, "tpl-interp", 1);
      return;
    }
    case "property": {
      if (!ctx.ingredientKeys.has(expr.object)) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.start,
          expr.length,
          `There's no ingredient called \`${expr.object}\`. ` +
            "Add it to the ingredients list above, " +
            "or check that the spelling matches.",
        );
        return;
      }
      if (expr.property !== "amount" && expr.property !== "name") {
        pushInvalid(
          tokens,
          diagnostics,
          expr.start,
          expr.length,
          `\`.${expr.property}\` isn't something you can ask for. ` +
            "Use `.amount` to get just the number, " +
            "or `.name` to get the ingredient's name.",
        );
        return;
      }
      pushToken(tokens, expr.start, expr.length, "tpl-interp", 1);
      return;
    }
    case "call": {
      if (!BUILTINS.has(expr.name)) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.nameRange.start,
          expr.nameRange.length,
          `There's no \`${expr.name}\` function. You can use: ` +
            "`round`, `ceil` (round up), `floor` (round down), " +
            "`min`, `max`, or `abs` (drop the minus sign).",
        );
      } else {
        pushToken(
          tokens,
          expr.nameRange.start,
          expr.nameRange.length,
          "tpl-interp",
          1,
        );
      }
      for (const a of expr.args) {
        emitExpr(a, ctx, tokens, diagnostics);
        requireNumeric(a, "function arguments", tokens, diagnostics);
      }
      return;
    }
    case "binary":
      pushToken(
        tokens,
        expr.opRange.start,
        expr.opRange.length,
        "tpl-operator",
        1,
      );
      emitExpr(expr.left, ctx, tokens, diagnostics);
      emitExpr(expr.right, ctx, tokens, diagnostics);
      // Missing operand: the parser leaves a zero-length `invalid_expr`
      // at EOF which is filtered out by the highlight pipeline. Anchor a
      // friendly message to the operator itself instead.
      if (isMissingOperand(expr.right)) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.opRange.start,
          expr.opRange.length,
          `\`${expr.op}\` is missing a value on its right. ` +
            `Add a number or an ingredient after it.`,
        );
      } else {
        requireNumeric(expr.right, "math", tokens, diagnostics);
      }
      if (isMissingOperand(expr.left)) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.opRange.start,
          expr.opRange.length,
          `\`${expr.op}\` is missing a value on its left. ` +
            `Add a number or an ingredient before it.`,
        );
      } else {
        requireNumeric(expr.left, "math", tokens, diagnostics);
      }
      // Literal divide-by-zero. (Runtime catches non-literal zeros, e.g.
      // `1 / (3 - 3)`, in the evaluator.)
      if (
        expr.op === "/" && expr.right.kind === "number" &&
        expr.right.value === 0
      ) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.right.start,
          expr.right.length,
          "You can't divide by zero.",
        );
      }
      return;
    case "unary":
      pushToken(
        tokens,
        expr.opRange.start,
        expr.opRange.length,
        "tpl-operator",
        1,
      );
      emitExpr(expr.operand, ctx, tokens, diagnostics);
      if (isMissingOperand(expr.operand)) {
        pushInvalid(
          tokens,
          diagnostics,
          expr.opRange.start,
          expr.opRange.length,
          `\`${expr.op}\` needs a number or ingredient after it.`,
        );
      } else {
        requireNumeric(expr.operand, "math", tokens, diagnostics);
      }
      return;
  }
}

/** True when `expr` parsed as a placeholder for "nothing was here". */
function isMissingOperand(expr: Expr): boolean {
  return expr.kind === "invalid_expr" && expr.length === 0;
}

/**
 * Emit a "you can't do math on text" diagnostic if `expr` is an `.name`
 * property access. `context` says where the value is being used ("math",
 * "function arguments", …) and is woven into the message.
 *
 * Other expression kinds (numbers, ingredient amounts, function calls,
 * nested math) always yield numbers, so they're fine.
 */
function requireNumeric(
  expr: Expr,
  context: string,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  if (expr.kind === "property" && expr.property === "name") {
    pushInvalid(
      tokens,
      diagnostics,
      expr.start,
      expr.length,
      `\`.name\` gives you text (the ingredient's name), so it can't be ` +
        `used in ${context}. Use \`.amount\` if you want the number.`,
    );
  }
}

function pushToken(
  tokens: HighlightToken[],
  start: number,
  length: number,
  label: string,
  priority: number,
): void {
  if (length <= 0) return;
  tokens.push({ start, end: start + length, label, priority });
}

function pushInvalid(
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
  start: number,
  length: number,
  message: string,
): void {
  if (length <= 0) return;
  tokens.push({
    start,
    end: start + length,
    label: "tpl-invalid",
    priority: 10,
  });
  diagnostics.push({ start, end: start + length, message });
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Exported for tests / external consumers wanting to build their own UI.
export function collectStepBodyDiagnostics(
  source: string,
  ctx: StepBodyContext,
): CollectResult {
  return collect(source, ctx);
}

export type { HighlightToken };

// Re-export the AST entry point so callers can do their own analysis if
// they want to (e.g. surface error messages on hover).
export { parseTemplate };
export type { TemplateAst };
