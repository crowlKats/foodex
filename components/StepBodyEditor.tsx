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

/** A declared ingredient, as the sibling ingredient form has it. */
import {
  collectStepBodyDiagnostics,
  type StepBodyContext,
  type StepBodyDiagnostic,
  type StepBodyIngredient,
} from "../lib/step-body-diagnostics.ts";

// Re-exported so existing consumers keep their import paths.
export { collectStepBodyDiagnostics };
export type { StepBodyContext, StepBodyDiagnostic, StepBodyIngredient };

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
      const { tokens, diagnostics: d } = collectStepBodyDiagnostics(
        text,
        getContext(),
      );
      diagnosticsRef.current = d;
      diagnostics.value = d;
      // Only errors gate Save — a warning is about quality, not validity.
      trackerRef.current?.update(
        d.filter((x) => x.severity !== "warning").length,
      );
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

  /**
   * Where the caret was when the editor last lost focus, so the insert bar
   * can drop a token where the author was typing rather than at the end.
   */
  const caretRef = useRef<number | null>(null);

  function rememberCaret(e: Event) {
    const root = e.currentTarget as HTMLElement;
    const sel = globalThis.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return;
    caretRef.current = nodeOffsetToTextOffset(
      root,
      range.startContainer,
      range.startOffset,
    );
  }

  /**
   * Insert `{{ key }}` at the caret. Typing `50g butter` is faster and more
   * natural than typing `{{ butter }}`, which made the broken path the easy
   * one — this is the counterweight.
   */
  function insertToken(key: string) {
    const at = caretRef.current ?? value.length;
    const token = `{{ ${key} }}`;
    const before = value.slice(0, at);
    const after = value.slice(at);
    // Don't glue the token onto an adjacent word.
    const lead = before && !/\s$/.test(before) ? " " : "";
    const trail = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
    onValueChange(before + lead + token + trail + after);
    caretRef.current = at + lead.length + token.length;
  }

  // Close popup on Escape — the backdrop handles outside-click directly.
  useEffect(() => {
    if (!popupOpen.value) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") popupOpen.value = false;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popupOpen.value]);

  // `getContext` reads the sibling ingredient form out of the DOM, so it can
  // only run on the client — everything else that calls it does so from the
  // highlight pass, which never runs during SSR.
  const insertable = typeof document === "undefined"
    ? []
    : (getContext().ingredients ?? []).filter((i) => i.key);
  const errorCount =
    diagnostics.value.filter((d) => d.severity !== "warning").length;
  const hasErrors = diagnostics.value.length > 0;
  const minHeight = `${rows * 1.5}rem`;
  const cls = [
    "step-body-editor",
    "block w-full font-mono whitespace-pre-wrap break-words",
    "border-2 bg-stone-100 dark:bg-stone-800",
    errorCount > 0
      ? "border-red-600 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500"
      : hasErrors
      ? "border-amber-500 dark:border-amber-500 focus:border-amber-500"
      : "border-stone-300 dark:border-stone-700 focus:border-orange-600 dark:focus:border-orange-500",
    "text-stone-900 dark:text-stone-100 text-sm leading-normal px-3 py-2",
    "transition-colors duration-75 focus:outline-none",
    props.class,
  ].filter(Boolean).join(" ");

  return (
    <div>
      {
        /* The badge is positioned against this wrapper, so the insert bar has
          to sit outside it or the two overlap. */
      }
      <div class="step-body-editor-wrapper relative" ref={wrapperRef}>
        <HighlightableTextarea
          value={value}
          highlight={highlight}
          onInput={(e: Event) => {
            onValueChange(
              (e.currentTarget as HTMLDivElement).textContent ?? "",
            );
          }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onKeyUp={rememberCaret}
          onMouseUp={rememberCaret}
          onBlur={rememberCaret}
          aria-placeholder={props.placeholder}
          style={{ minHeight, boxSizing: "border-box" }}
          class={cls}
        />
        {hasErrors && (
          <button
            type="button"
            data-step-body-error-badge
            class={`step-body-error-badge ${
              errorCount === 0 ? "step-body-error-badge-warning" : ""
            }`}
            aria-label={`${diagnostics.value.length} problem${
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
                  <li
                    key={`${d.start}-${i}`}
                    class="step-body-error-popup-item"
                  >
                    <code class="step-body-error-popup-snippet">
                      <ContextSnippet source={value} diagnostic={d} />
                    </code>
                    <div class="step-body-error-popup-message">
                      {renderMessage(d.message)}
                    </div>
                    {d.fix && (
                      <button
                        type="button"
                        class="step-body-error-popup-fix"
                        onClick={() => {
                          const fix = d.fix!;
                          onValueChange(
                            value.slice(0, fix.start) + fix.replacement +
                              value.slice(fix.end),
                          );
                          // Offsets after this point have shifted, so the rest
                          // of the list is stale — close rather than mislead.
                          popupOpen.value = false;
                        }}
                      >
                        {d.fix.label}
                      </button>
                    )}
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
      {insertable.length > 0 && (
        <div class="flex flex-wrap items-center gap-1 mt-1">
          <span class="text-xs text-stone-500 mr-0.5">Insert:</span>
          {insertable.map((ing) => (
            <button
              key={ing.key}
              type="button"
              class="step-body-insert-chip"
              title={`Insert {{ ${ing.key} }} — scales with the recipe`}
              // Keep the caret where it was; the chip must not steal focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertToken(ing.key)}
            >
              {ing.name.trim() || ing.key}
            </button>
          ))}
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
 * Character offset of (`node`, `offsetInNode`) within `root.textContent`.
 * Same traversal `caretOffsetFromPoint` uses, factored out so the insert bar
 * can locate the caret from a Selection rather than a mouse position.
 */
function nodeOffsetToTextOffset(
  root: HTMLElement,
  node: Node,
  offsetInNode: number,
): number | null {
  if (node === root) {
    let acc = 0;
    for (let i = 0; i < offsetInNode && i < root.childNodes.length; i++) {
      acc += (root.childNodes[i].textContent ?? "").length;
    }
    return acc;
  }
  let total = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === node || child.contains(node)) return total + offsetInNode;
    if (child.nodeType === Node.TEXT_NODE) {
      total += (child as Text).data.length;
    } else if ((child as Element).tagName === "BR") {
      total += 1;
    } else {
      total += (child.textContent ?? "").length;
    }
  }
  return null;
}

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

export type { HighlightToken };

// Re-export the AST entry point so callers can do their own analysis if
// they want to (e.g. surface error messages on hover).
export { parseTemplate };
export type { TemplateAst };
