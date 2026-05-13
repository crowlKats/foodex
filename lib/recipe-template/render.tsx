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
 * all done here in JSX-land — no HTML string concat anywhere downstream.
 */

import type { ComponentChildren, VNode } from "preact";
import { formatAmount } from "../format.ts";
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

export interface RenderContext {
  variables: Record<string, number>;
  ingredients?: Record<string, IngredientVar>;
  steps: RenderStepShape[];
  layout: SectionLayout;
  /** Map of `slug -> {title,slug}` for resolved sub-recipes. */
  recipeRefs?: Map<string, RecipeRefInfo>;
  /** Click handler for timer buttons; pass `null` to render a static button. */
  onTimerStart?: (seconds: number, label: string) => void;
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
    return renderError(`@step(${n})`, `Unknown step ${n}`);
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
      `Unknown section: ${node.sectionKey}`,
    );
  }
  const indices = ctx.layout.bySectionId.get(sec.id) ?? [];
  if (node.number < 1 || node.number > indices.length) {
    return renderError(
      `@step(${node.sectionKey}.${node.number})`,
      `Unknown step ${node.number} in section ${node.sectionKey}`,
    );
  }
  const targetIdx = indices[node.number - 1];
  const title = ctx.steps[targetIdx].title.trim();
  const base = `${sec.title} step ${node.number}`;
  const label = title ? `${base} (${title})` : base;
  return <a href={`#${ctx.layout.anchors[targetIdx]}`}>{label}</a>;
}

function renderTimer(node: TimerNode, ctx: RenderContext): ComponentChildren {
  if (node.seconds == null) {
    return renderError(`@timer(${node.duration})`, "Invalid duration");
  }
  const seconds = node.seconds;
  const label = formatDurationLabel(seconds);
  const onClick = ctx.onTimerStart
    ? () => ctx.onTimerStart!(seconds, label)
    : undefined;
  return (
    <button
      type="button"
      class="recipe-timer-btn"
      data-seconds={seconds}
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
    return renderError(`@recipe(${node.slug})`, `Unknown recipe: ${node.slug}`);
  }
  return <a href={`/recipes/${encodeURIComponent(ref.slug)}`}>{ref.title}</a>;
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
