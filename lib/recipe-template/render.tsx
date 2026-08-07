/** @jsxRuntime automatic */
/** @jsxImportSource preact */

/**
 * Renders a parsed template AST to Preact JSX.
 *
 * Pipeline:
 *   1. Walk the template AST. For each non-text node, allocate a placeholder
 *      slot and stash the resolved VNode (or text) in a side table.
 *   2. Concatenate text nodes + placeholder strings into a single markdown
 *      source.
 *   3. Hand the source to `renderMarkdown` (see `markdown-jsx.tsx`), which
 *      tokenises with marked and splices the slot contents back in.
 *
 * The directive resolution (timer, step ref, recipe ref, interpolation) is
 * all done here in JSX-land, with no HTML string concat anywhere downstream.
 */

import type { ComponentChildren, VNode } from "preact";
import { formatAmount } from "../format.ts";
import { formatQuantity } from "../quantity.ts";
import type { SectionInfo, SectionLayout } from "../step-sections.ts";
import {
  collectIngredientRefs,
  evaluateExpr,
  firstIngredientRefCasing,
  type IngredientVar,
  isCapitalizedRef,
} from "./evaluator.ts";
import { parseTemplate } from "./parser.ts";
import type {
  DishRefNode,
  Expr,
  InterpolationNode,
  InvalidDirectiveNode,
  RecipeRefNode,
  StepRefGlobalNode,
  StepRefSectionNode,
  TemplateAst,
  TemplateNode,
  TimerNode,
} from "./ast.ts";
import { placeholder, renderMarkdown } from "./markdown-jsx.tsx";

export interface RenderStepShape {
  title: string;
  body: string;
  section_id?: string | null;
}

export interface RecipeRefInfo {
  slug: string;
  title: string;
}

/** Current (possibly retargeted) tray size of a dimensions recipe, in cm. */
export interface TrayDims {
  value: number;
  value2?: number;
  value3?: number;
}

export interface RenderContext {
  variables: Record<string, number>;
  /** Set only for dimensions recipes; resolves the {{ tray }} ref. */
  tray?: TrayDims;
  ingredients?: Record<string, IngredientVar>;
  steps: RenderStepShape[];
  layout: SectionLayout;
  /** Map of `slug -> {title,slug}` for resolved sub-recipes. */
  recipeRefs?: Map<string, RecipeRefInfo>;
  /** Map of `slug -> {title,slug}` for resolved dishes (`@dish(...)`). */
  dishRefs?: Map<string, RecipeRefInfo>;
  /** Click handler for timer buttons; pass `null` to render a static button.
   *  `maxSeconds` is set for range timers (`@timer(4-6m)`): the countdown
   *  runs to `seconds` and the rest is offered as a one-tap extension. */
  onTimerStart?: (seconds: number, label: string, maxSeconds?: number) => void;
}

/** Render the parsed template AST to a Preact VNode tree. */
export function renderTemplateAst(
  ast: TemplateAst,
  ctx: RenderContext,
): VNode {
  const slots: ComponentChildren[] = [];
  let source = "";

  const slot = (vnode: ComponentChildren): string => {
    const idx = slots.length;
    slots.push(vnode);
    return placeholder(idx);
  };

  for (const node of ast.nodes) {
    source += renderNodeToMarkdown(node, ctx, slot);
  }
  return renderMarkdown(source, (i) => slots[i]);
}

/** Convenience: parse the source text and render in one shot. */
export function renderTemplate(
  source: string,
  ctx: RenderContext,
): VNode {
  return renderTemplateAst(parseTemplate(source), ctx);
}

// ── Node-by-node directive resolution ──────────────────────────────────────

function renderNodeToMarkdown(
  node: TemplateNode,
  ctx: RenderContext,
  slot: (vnode: ComponentChildren) => string,
): string {
  switch (node.kind) {
    case "text":
      return node.value;
    case "interpolation":
      return slot(renderInterpolation(node, ctx));
    case "step_ref":
      return slot(renderStepRef(node, ctx));
    case "step_ref_section":
      return slot(renderSectionStepRef(node, ctx));
    case "timer":
      return slot(renderTimer(node, ctx));
    case "recipe_ref":
      return slot(renderRecipeRef(node, ctx));
    case "dish_ref":
      return slot(renderDishRef(node, ctx));
    case "invalid_directive":
      return slot(renderInvalid(node));
  }
}

function renderInterpolation(
  node: InterpolationNode,
  ctx: RenderContext,
): ComponentChildren {
  const expr = node.expr;
  if (expr.kind === "invalid_expr") {
    return renderError(`{{ ${expr.raw} }}`, expr.message);
  }

  // {{ tray }}: the recipe's (scaled) tray dimensions, as text. Only valid
  // bare: it's a string, so it can't take part in math.
  if (expr.kind === "variable" && expr.name.toLowerCase() === "tray") {
    if (!ctx.tray) {
      return renderError(
        "{{ tray }}",
        "This recipe has no tray dimensions; its quantity type isn't a tray.",
      );
    }
    return formatQuantity({
      type: "dimensions",
      value: ctx.tray.value,
      unit: "cm",
      value2: ctx.tray.value2,
      value3: ctx.tray.value3,
    });
  }
  if (referencesTray(expr)) {
    return renderError(
      rawOf(expr),
      "`tray` is text (the tray size), so it can't be used in math.",
    );
  }

  // Special case: bare property access on an ingredient name.
  if (
    expr.kind === "property" && ctx.ingredients &&
    expr.object in ctx.ingredients && expr.property === "name"
  ) {
    return ctx.ingredients[expr.object].name.toLowerCase();
  }

  const allVars: Record<string, number> = { ...ctx.variables };
  if (ctx.ingredients) {
    for (const [key, ing] of Object.entries(ctx.ingredients)) {
      allVars[`${key}_amount`] = ing.amount;
    }
  }

  // Single-ingredient interpolation: render as "<amount><unit> <name>".
  if (ctx.ingredients) {
    const refs = collectIngredientRefs(expr, ctx.ingredients);
    if (refs.size === 1) {
      const [key] = refs;
      const ing = ctx.ingredients[key];
      const scoped = { ...allVars, [key]: ing.amount };
      const result = evaluateExpr(expr, {
        variables: scoped,
        ingredients: ctx.ingredients,
      });
      if (result.error) return renderError(rawOf(expr), result.error);
      const originalRef = firstIngredientRefCasing(expr, ctx.ingredients) ??
        key;
      const capitalize = isCapitalizedRef(originalRef);
      const name = capitalize
        ? ing.name.charAt(0).toUpperCase() + ing.name.slice(1).toLowerCase()
        : ing.name.toLowerCase();
      return `${formatAmount(result.value, ing.unit)}${ing.unit} ${name}`;
    }
  }

  const result = evaluateExpr(expr, {
    variables: allVars,
    ingredients: ctx.ingredients,
  });
  if (result.error) return renderError(rawOf(expr), result.error);
  return formatAmount(result.value);
}

function renderStepRef(
  node: StepRefGlobalNode,
  ctx: RenderContext,
): ComponentChildren {
  const n = node.number;
  if (n < 1 || n > ctx.steps.length) {
    return renderError(`@step(${n})`, `There's no step ${n} in this recipe.`);
  }
  const idx = n - 1;
  const title = ctx.steps[idx].title.trim();
  const label = title ? `step ${n} (${title})` : `step ${n}`;
  return <a href={`#${ctx.layout.anchors[idx]}`}>{label}</a>;
}

function renderSectionStepRef(
  node: StepRefSectionNode,
  ctx: RenderContext,
): ComponentChildren {
  const sec = ctx.layout.byKey.get(node.sectionKey);
  if (!sec) {
    return renderError(
      `@step(${node.sectionKey}.${node.number})`,
      `No section called "${node.sectionKey}" in this recipe.`,
    );
  }
  const indices = ctx.layout.bySectionId.get(sec.id) ?? [];
  if (node.number < 1 || node.number > indices.length) {
    return renderError(
      `@step(${node.sectionKey}.${node.number})`,
      `The "${node.sectionKey}" section doesn't have a step ${node.number}.`,
    );
  }
  const targetIdx = indices[node.number - 1];
  const title = ctx.steps[targetIdx].title.trim();
  const base = `${sec.title} step ${node.number}`;
  const label = title ? `${base} (${title})` : base;
  return <a href={`#${ctx.layout.anchors[targetIdx]}`}>{label}</a>;
}

function renderTimer(node: TimerNode, ctx: RenderContext): ComponentChildren {
  const seconds = node.seconds;
  const label = node.secondsMax != null
    ? formatRangeLabel(seconds, node.secondsMax)
    : formatDurationLabel(seconds);
  const onClick = ctx.onTimerStart
    ? () => ctx.onTimerStart!(seconds, label, node.secondsMax)
    : undefined;
  return (
    <button
      type="button"
      class="recipe-timer-btn"
      data-seconds={seconds}
      data-seconds-max={node.secondsMax}
      data-label={label}
      onClick={onClick}
    >
      &#9202; {label}
    </button>
  );
}

function renderRecipeRef(
  node: RecipeRefNode,
  ctx: RenderContext,
): ComponentChildren {
  const ref = ctx.recipeRefs?.get(node.slug);
  if (!ref) {
    return renderError(
      `@recipe(${node.slug})`,
      `Can't find a recipe with the slug "${node.slug}".`,
    );
  }
  return <a href={`/recipes/${encodeURIComponent(ref.slug)}`}>{ref.title}</a>;
}

function renderDishRef(
  node: DishRefNode,
  ctx: RenderContext,
): ComponentChildren {
  const ref = ctx.dishRefs?.get(node.slug);
  if (!ref) {
    return renderError(
      `@dish(${node.slug})`,
      `Can't find a dish with the slug "${node.slug}".`,
    );
  }
  return <a href={`/dishes/${encodeURIComponent(ref.slug)}`}>{ref.title}</a>;
}

function renderInvalid(node: InvalidDirectiveNode): ComponentChildren {
  return renderError(node.raw, node.message);
}

function renderError(raw: string, message: string): VNode {
  return (
    <span class="recipe-template-error" title={message}>
      {raw}
    </span>
  );
}

function rawOf(expr: Expr): string {
  // Reconstruct a printable version of the expression text. We don't have the
  // original source here, so fall back to a minimal description.
  switch (expr.kind) {
    case "number":
      return String(expr.value);
    case "variable":
      return expr.name;
    case "property":
      return `${expr.object}.${expr.property}`;
    case "call":
      return `${expr.name}(...)`;
    case "binary":
      return `${rawOf(expr.left)} ${expr.op} ${rawOf(expr.right)}`;
    case "unary":
      return `-${rawOf(expr.operand)}`;
    case "invalid_expr":
      return expr.raw;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** "4-6 min" when both bounds share one unit, else "4 min - 1h 30 min". */
function formatRangeLabel(lowSeconds: number, highSeconds: number): string {
  const low = formatDurationLabel(lowSeconds);
  const high = formatDurationLabel(highSeconds);
  const lm = low.match(/^(\d+)(h| min|s)$/);
  const hm = high.match(/^(\d+)(h| min|s)$/);
  if (lm && hm && lm[2] === hm[2]) return `${lm[1]}-${hm[1]}${hm[2]}`;
  return `${low} - ${high}`;
}

function formatDurationLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m} min`);
  if (s > 0 && h === 0 && m === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

/** Scale ingredient amounts by a ratio into the keyed lookup the evaluator wants. */
export function scaleIngredients(
  ingredients: { key: string; amount: number; unit: string; name: string }[],
  ratio: number,
): Record<string, IngredientVar> {
  const result: Record<string, IngredientVar> = {};
  for (const ing of ingredients) {
    if (!ing.key) continue;
    result[ing.key] = {
      amount: ing.amount * ratio,
      unit: ing.unit,
      name: ing.name,
    };
  }
  return result;
}

export type { IngredientVar, SectionInfo };

/** True when `expr` mentions the `tray` builtin anywhere below the top level. */
function referencesTray(expr: Expr): boolean {
  switch (expr.kind) {
    case "variable":
      return expr.name.toLowerCase() === "tray";
    case "property":
      return expr.object.toLowerCase() === "tray";
    case "binary":
      return referencesTray(expr.left) || referencesTray(expr.right);
    case "unary":
      return referencesTray(expr.operand);
    case "call":
      return expr.args.some(referencesTray);
  }
  return false;
}
