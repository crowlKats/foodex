/**
 * Evaluator for the expression AST.
 *
 * Returns `{ value, error }` rather than throwing — invalid AST branches or
 * missing variables yield NaN with a diagnostic message attached, leaving it
 * up to the caller to render an error placeholder.
 */

import type { Expr } from "./ast.ts";

export interface IngredientVar {
  amount: number;
  unit: string;
  name: string;
}

export interface EvalContext {
  variables: Record<string, number>;
  /** Ingredient lookup table keyed by ingredient key (e.g. "flour"). */
  ingredients?: Record<string, IngredientVar>;
}

export interface EvalResult {
  value: number;
  error: string | null;
}

const BUILTINS: Record<string, (...args: number[]) => number> = {
  round: (n) => Math.round(n),
  ceil: (n) => Math.ceil(n),
  floor: (n) => Math.floor(n),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (n) => Math.abs(n),
};

export function evaluateExpr(expr: Expr, ctx: EvalContext): EvalResult {
  switch (expr.kind) {
    case "invalid_expr":
      return { value: NaN, error: expr.message };

    case "number":
      return ok(expr.value);

    case "variable": {
      const v = lookupVariable(expr.name, ctx);
      if (v.found) return ok(v.value);
      return err(`Unknown variable: '${expr.name}'`);
    }

    case "property": {
      // Stored flat as `${object}_${property}` in the variables table (the
      // template ingestion in lib/recipe-template/render.tsx populates these).
      const key = `${expr.object}_${expr.property}`;
      if (key in ctx.variables) return ok(ctx.variables[key]);
      return err(`Unknown property: '${expr.object}.${expr.property}'`);
    }

    case "unary": {
      const inner = evaluateExpr(expr.operand, ctx);
      if (inner.error) return inner;
      return ok(-inner.value);
    }

    case "binary": {
      const l = evaluateExpr(expr.left, ctx);
      if (l.error) return l;
      const r = evaluateExpr(expr.right, ctx);
      if (r.error) return r;
      switch (expr.op) {
        case "+":
          return ok(l.value + r.value);
        case "-":
          return ok(l.value - r.value);
        case "*":
          return ok(l.value * r.value);
        case "/":
          return ok(r.value === 0 ? 0 : l.value / r.value);
      }
    }
    // eslint-disable-next-line no-fallthrough -- unreachable but keeps TS happy

    case "call": {
      const fn = BUILTINS[expr.name];
      if (!fn) return err(`Unknown function: '${expr.name}'`);
      const args: number[] = [];
      for (const a of expr.args) {
        const r = evaluateExpr(a, ctx);
        if (r.error) return r;
        args.push(r.value);
      }
      return ok(fn(...args));
    }
  }
}

function lookupVariable(
  name: string,
  ctx: EvalContext,
): { found: boolean; value: number } {
  if (name in ctx.variables) return { found: true, value: ctx.variables[name] };
  // Ingredient amounts are also exposed as bare variable names so `{{ flour }}`
  // resolves to its scaled amount.
  if (ctx.ingredients) {
    if (name in ctx.ingredients) {
      return { found: true, value: ctx.ingredients[name].amount };
    }
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    if (lower in ctx.ingredients) {
      return { found: true, value: ctx.ingredients[lower].amount };
    }
  }
  return { found: false, value: NaN };
}

function ok(value: number): EvalResult {
  return { value, error: null };
}
function err(message: string): EvalResult {
  return { value: NaN, error: message };
}

// ── Ingredient awareness ────────────────────────────────────────────────────

/**
 * Collect the ingredient keys referenced anywhere in `expr` (matching
 * keys present in `ingredients`, case-insensitive on the first character).
 */
export function collectIngredientRefs(
  expr: Expr,
  ingredients: Record<string, IngredientVar>,
  out: Set<string> = new Set(),
): Set<string> {
  switch (expr.kind) {
    case "variable": {
      if (expr.name in ingredients) out.add(expr.name);
      else {
        const lower = expr.name.charAt(0).toLowerCase() + expr.name.slice(1);
        if (lower in ingredients) out.add(lower);
      }
      return out;
    }
    case "binary":
      collectIngredientRefs(expr.left, ingredients, out);
      collectIngredientRefs(expr.right, ingredients, out);
      return out;
    case "unary":
      collectIngredientRefs(expr.operand, ingredients, out);
      return out;
    case "call":
      for (const a of expr.args) collectIngredientRefs(a, ingredients, out);
      return out;
  }
  return out;
}

/** Find the first ingredient-typed variable, preserving the user's casing. */
export function firstIngredientRefCasing(
  expr: Expr,
  ingredients: Record<string, IngredientVar>,
): string | null {
  switch (expr.kind) {
    case "variable": {
      if (expr.name in ingredients) return expr.name;
      const lower = expr.name.charAt(0).toLowerCase() + expr.name.slice(1);
      if (lower in ingredients) return expr.name;
      return null;
    }
    case "binary":
      return firstIngredientRefCasing(expr.left, ingredients) ??
        firstIngredientRefCasing(expr.right, ingredients);
    case "unary":
      return firstIngredientRefCasing(expr.operand, ingredients);
    case "call": {
      for (const a of expr.args) {
        const r = firstIngredientRefCasing(a, ingredients);
        if (r) return r;
      }
      return null;
    }
  }
  return null;
}

export function isCapitalizedRef(name: string): boolean {
  const c = name.charAt(0);
  return c >= "A" && c <= "Z";
}
