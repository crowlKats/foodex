// Server-side check that every {{ template }} ref in a staged recipe's steps
// resolves to an ingredient row key. Returned as a tool error so the model
// fixes the mismatch itself (e.g. swapping an ingredient but leaving the old
// key in a step body) instead of handing the user a broken proposal.

import { parseTemplate } from "../recipe-template/parser.ts";
import type { Expr } from "../recipe-template/ast.ts";

function collectVars(expr: Expr, out: Set<string>): void {
  switch (expr.kind) {
    case "variable":
      out.add(expr.name);
      break;
    case "property":
      out.add(expr.object);
      break;
    case "binary":
      collectVars(expr.left, out);
      collectVars(expr.right, out);
      break;
    case "unary":
      collectVars(expr.operand, out);
      break;
    case "call":
      for (const a of expr.args) collectVars(a, out);
      break;
  }
}

/**
 * Every step-body template ref that doesn't match an ingredient row's key,
 * as human-readable problem lines. Capitalized refs ({{ Flour }}) are the
 * template language's capitalization feature, so the first character is
 * case-insensitive — same as the evaluator.
 */
export function unknownTemplateRefs(
  recipe: Record<string, unknown>,
): string[] {
  const keys = new Set(
    (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map((i) => String((i as Record<string, unknown>).key ?? ""))
      .filter(Boolean),
  );
  const problems: string[] = [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  steps.forEach((s, i) => {
    const step = s as Record<string, unknown>;
    const body = String(step.body ?? "");
    if (!body.includes("{{")) return;
    let ast;
    try {
      ast = parseTemplate(body);
    } catch {
      return;
    }
    const vars = new Set<string>();
    for (const node of ast.nodes) {
      if (node.kind === "interpolation") collectVars(node.expr, vars);
    }
    for (const v of vars) {
      const lower = v.charAt(0).toLowerCase() + v.slice(1);
      if (!keys.has(v) && !keys.has(lower)) {
        const label = step.title ? `"${step.title}"` : `#${i + 1}`;
        problems.push(
          `step ${label} references {{ ${v} }} but no ingredient row has key "${lower}"`,
        );
      }
    }
  });
  return problems;
}
