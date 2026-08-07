// Step-body template diagnostics: the pure text-analysis half of
// components/StepBodyEditor.tsx, extracted so server code (the agent's
// staging validation) can run the exact same checks without dragging in the
// editor component or its browser-only dependencies.

import { parseTemplate } from "./recipe-template/parser.ts";
import type {
  Expr,
  StepRefGlobalNode,
  StepRefSectionNode,
  TemplateNode,
} from "./recipe-template/ast.ts";

/**
 * Structurally identical to @luca/highlightable-textarea's HighlightToken,
 * redeclared here so this module has no dependency on it.
 */
export interface HighlightToken {
  start: number;
  end: number;
  label: string;
  priority: number;
}

export interface StepBodyIngredient {
  key: string;
  name: string;
  unit: string;
}

/** Information the highlighter needs to flag semantic errors. */
export interface StepBodyContext {
  /** Ingredient keys defined elsewhere in the form (e.g. `flour`, `sugar`). */
  ingredientKeys: Set<string>;
  /** Number of steps total, used to validate `@step(N)` references. */
  totalSteps: number;
  /** Map of section key → number of steps in that section. */
  sectionStepCounts: Map<string, number>;
  /**
   * Declared ingredients in full, for the literal-amount lint and the
   * insert bar. Optional so existing callers keep compiling.
   */
  ingredients?: StepBodyIngredient[];
}

/** Diagnostic emitted alongside a `tpl-invalid` highlight. */
export interface StepBodyDiagnostic {
  start: number;
  end: number;
  message: string;
  /**
   * A one-click repair. The panel already explains what's wrong; when the
   * answer is unambiguous it should also be able to apply it.
   */
  fix?: { start: number; end: number; replacement: string; label: string };
  /**
   * Warnings don't block saving and don't turn the field red. A typed-out
   * amount is valid template source; it just quietly stops scaling.
   */
  severity?: "error" | "warning";
}

/**
 * Levenshtein distance, capped. We only care whether two keys are within a
 * typo or two of each other, so there's no need to fill the whole matrix.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * The closest declared key to `name`, if one is near enough to be a typo.
 *
 * The panel used to say "check that the spelling matches" while holding the
 * full list of valid keys (`buttr` is one edit from `butter`).
 */
function nearestKey(name: string, keys: Iterable<string>): string | null {
  const lower = name.toLowerCase();
  // Allow more slack for longer keys: `longrain_rice` → `long_grain_rice`.
  const max = Math.max(2, Math.floor(lower.length / 3));
  let best: string | null = null;
  let bestDist = max + 1;
  for (const key of keys) {
    const dist = editDistance(lower, key.toLowerCase(), max);
    if (dist < bestDist) {
      bestDist = dist;
      best = key;
    }
  }
  return bestDist <= max ? best : null;
}

const BUILTINS = new Set(["round", "ceil", "floor", "min", "max", "abs"]);

interface CollectResult {
  tokens: HighlightToken[];
  diagnostics: StepBodyDiagnostic[];
}

function collect(source: string, ctx: StepBodyContext): CollectResult {
  const ast = parseTemplate(source);
  const tokens: HighlightToken[] = [];
  const diagnostics: StepBodyDiagnostic[] = [];
  for (let i = 0; i < ast.nodes.length; i++) {
    const node = ast.nodes[i];
    emitNode(node, ctx, tokens, diagnostics);
    if (node.kind === "interpolation") {
      lintRefProse(
        node,
        ast.nodes[i - 1],
        ast.nodes[i + 1],
        ctx,
        tokens,
        diagnostics,
      );
    }
    if (node.kind === "text") {
      lintLiteralAmounts(node.value, node.start, ctx, tokens, diagnostics);
      lintTimerlessDurations(
        node.value,
        node.start,
        ast.nodes[i - 1],
        ast.nodes[i + 1],
        tokens,
        diagnostics,
      );
    }
  }
  return { tokens, diagnostics };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Ways a step may refer to an ingredient by (partial) name: the full name,
 * its word suffixes ("Pasta cooking water" is written as "cooking water" or
 * "water"), and the head word of romance-language names ("Bottarga di
 * muggine" is just "bottarga" in prose). Short fragments are dropped; they
 * match too much.
 */
const NAME_LINKING_WORDS = new Set(
  ["di", "de", "of", "alla", "al", "con", "da", "du", "des", "la", "le", "el"],
);

function nameVariants(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out = new Set<string>([words.join(" ")]);
  for (let k = 1; k < words.length; k++) {
    const v = words.slice(k).join(" ");
    if (v.length >= 4) out.add(v);
  }
  if (
    words.length > 1 && NAME_LINKING_WORDS.has(words[1].toLowerCase()) &&
    words[0].length >= 4
  ) {
    out.add(words[0]);
  }
  // Longest first, so the most specific phrasing claims the match.
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Words that signal the number is a duration or direction, not an amount of
 * the ingredient ("2 minutes until the water boils").
 */
const NOT_AMOUNT_FILLER =
  "(?!(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|until|then|and|or|to|into|over|with|before|after)\\b)";

/**
 * Flag a typed-out amount that names a declared ingredient: `50g butter`
 * where `butter` is declared as 50 g, including loose phrasings such as
 * "25 g grated bottarga" or "100 g of pasta water".
 *
 * The editor already catches misspelled keys beautifully, but a correctly
 * spelled bare number got nothing at all, even though it's the failure that
 * costs users: it silently doesn't scale, so at 8 servings the step says 50g
 * while the ingredient list says 100 g and the recipe contradicts itself.
 * Only reachable for a reader who scaled, which is why it needs flagging at
 * author time.
 *
 * A warning, not an error: the text is valid, just not scalable.
 */
function lintLiteralAmounts(
  text: string,
  offset: number,
  ctx: StepBodyContext,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  const ingredients = ctx.ingredients;
  if (!ingredients || ingredients.length === 0) return;

  // One warning per span, even when several ingredients/variants match.
  const claimed: { start: number; end: number }[] = [];
  const overlapsClaimed = (s: number, e: number) =>
    claimed.some((r) => s < r.end && r.start < e);

  for (const ing of ingredients) {
    const name = ing.name.trim();
    if (!name || !ing.key) continue;
    // `<number> [unit] [of/the] [descriptor words] <name>`: the unit is
    // optional so bare countables ("2 onions") are caught too. Trailing "s"
    // allows the plural; up to two descriptor words cover "grated bottarga"
    // and "warm pasta water".
    const unitPart = ing.unit.trim()
      ? `(?:\\s*${escapeRegExp(ing.unit.trim())}\\b)?`
      : "";
    for (const variant of nameVariants(name)) {
      const re = new RegExp(
        `\\b\\d+(?:[.,]\\d+)?${unitPart}\\s+(?:(?:of|the)\\s+){0,2}` +
          `(?:${NOT_AMOUNT_FILLER}[A-Za-z-]+\\s+){0,2}` +
          `${escapeRegExp(variant)}s?\\b`,
        "gi",
      );
      for (const m of text.matchAll(re)) {
        const start = offset + (m.index ?? 0);
        const end = start + m[0].length;
        if (overlapsClaimed(start, end)) continue;
        claimed.push({ start, end });
        tokens.push({ start, end, label: "tpl-warning", priority: 5 });
        diagnostics.push({
          start,
          end,
          severity: "warning",
          message: `\`${m[0]}\` is typed out, so it won't scale with the ` +
            `recipe. Double the servings and this still says ` +
            `\`${m[0]}\`. Use \`{{ ${ing.key} }}\`, or arithmetic on ` +
            `\`${ing.key}.amount\` if this is a partial amount.`,
          fix: {
            start,
            end,
            replacement: `{{ ${ing.key} }}`,
            label: `Replace with {{ ${ing.key} }}`,
          },
        });
      }
    }
  }
}

/**
 * A bare `{{ key }}` renders amount + unit + name, which reads badly when the
 * surrounding prose already carries one of the two. Both shapes come from
 * imports and produce output like "10 g juice of the juice" or
 * "110 g of 120 g unsalted butter":
 *
 *  - `{{ key }} of the <name>`: the name renders twice. Fix: drop the phrase.
 *  - `<amount> of {{ key }}`: a written-out amount followed by the full ref.
 *    Fix: `{{ key.name }}`, or arithmetic on `key.amount` for a scaling
 *    partial amount.
 */
function lintRefProse(
  node: Extract<TemplateNode, { kind: "interpolation" }>,
  prev: TemplateNode | undefined,
  next: TemplateNode | undefined,
  ctx: StepBodyContext,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  const expr = node.expr;
  if (expr.kind !== "variable") return;
  const key = ctx.ingredientKeys.has(expr.name)
    ? expr.name
    : ctx.ingredientKeys.has(lowerFirst(expr.name))
    ? lowerFirst(expr.name)
    : null;
  if (!key) return;
  const name = ctx.ingredients?.find((g) => g.key === key)?.name.trim();

  if (name && next?.kind === "text") {
    const m = next.value.match(
      new RegExp(`^\\s*of\\s+(?:the\\s+)?${escapeRegExp(name)}s?\\b`, "i"),
    );
    if (m) {
      const start = next.start;
      const end = next.start + m[0].length;
      tokens.push({ start, end, label: "tpl-warning", priority: 5 });
      diagnostics.push({
        start,
        end,
        severity: "warning",
        message: `\`{{ ${key} }}\` already renders the amount, unit, and ` +
          `name, so "${m[0].trim()}" repeats the name right after it. ` +
          `Drop the repeated words.`,
        fix: { start, end, replacement: "", label: "Remove the repeated name" },
      });
      return;
    }
  }

  if (
    prev?.kind === "text" &&
    /\d+(?:[.,]\d+)?\s*[A-Za-z]*\s+of\s+(?:the\s+)?$/.test(prev.value)
  ) {
    const start = node.start;
    const end = node.start + node.length;
    tokens.push({ start, end, label: "tpl-warning", priority: 5 });
    diagnostics.push({
      start,
      end,
      severity: "warning",
      message: `\`{{ ${key} }}\` renders its own amount and name, but an ` +
        `amount is already written out before it ("110 g of 120 g butter"). ` +
        `Use \`{{ ${key}.name }}\` for just the name, or replace the whole ` +
        `phrase with arithmetic on \`${key}.amount\` so the partial amount ` +
        `scales.`,
      fix: {
        start,
        end,
        replacement: `{{ ${key}.name }}`,
        label: `Use {{ ${key}.name }}`,
      },
    });
  }
}

/**
 * Flag a stated duration with no timer next to it: "cook for 4-6 minutes"
 * can carry a one-tap countdown, and after an import it never does.
 *
 * Only durations introduced by "for/about/another/..." are flagged, which
 * skips clock-time phrasing ("30 minutes before serving") and prose that
 * merely mentions time. A match directly adjacent to an existing @timer
 * stays quiet. A range becomes a range timer ("4-6 minutes" → @timer(4-6m)),
 * which counts down to the lower bound so the cook checks early.
 *
 * A warning, not an error: the text is fine, it just misses a convenience.
 */
function lintTimerlessDurations(
  text: string,
  offset: number,
  prev: TemplateNode | undefined,
  next: TemplateNode | undefined,
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
): void {
  const re =
    /\b(for|about|around|approximately|another)\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/gi;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    // Adjacent to a timer node on either side: already covered.
    if (idx + m[0].length >= text.length - 2 && next?.kind === "timer") {
      continue;
    }
    if (idx <= 2 && prev?.kind === "timer") continue;
    const unit = m[4].toLowerCase().startsWith("h")
      ? "h"
      : m[4].toLowerCase().startsWith("s")
      ? "s"
      : "m";
    // A range must ascend for @timer(a-b); anything else gets a plain timer.
    const timer = m[3] && parseInt(m[2]) < parseInt(m[3])
      ? `@timer(${m[2]}-${m[3]}${unit})`
      : `@timer(${m[2]}${unit})`;
    const start = offset + idx;
    const end = start + m[0].length;
    tokens.push({ start, end, label: "tpl-warning", priority: 5 });
    diagnostics.push({
      start,
      end,
      severity: "warning",
      message: `\`${m[0]}\` states a duration without a timer. Replace it ` +
        `with \`${timer}\` so the countdown starts with a tap.`,
      fix: {
        start,
        end,
        replacement: `${m[1]} ${timer}`,
        label: `Use ${timer}`,
      },
    });
  }
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
    case "dish_ref":
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
        : `There's no step ${node.number}; this recipe has ${ctx.totalSteps} ` +
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
        "Check the section name above; it should match exactly " +
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
        expr.name === "ratio" ||
        lowerFirst(expr.name) === "tray";
      if (!known) {
        pushUnknownKey(
          tokens,
          diagnostics,
          ctx,
          expr.name,
          { start: expr.start, length: expr.length },
          { start: expr.start, end: expr.start + expr.length },
        );
        return;
      }
      pushToken(tokens, expr.start, expr.length, "tpl-interp", 1);
      return;
    }
    case "property": {
      if (!ctx.ingredientKeys.has(expr.object)) {
        pushUnknownKey(
          tokens,
          diagnostics,
          ctx,
          expr.object,
          { start: expr.start, length: expr.length },
          // Only the object part is wrong; `.amount` stays as written.
          { start: expr.start, end: expr.start + expr.object.length },
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
  if (expr.kind === "variable" && lowerFirst(expr.name) === "tray") {
    pushInvalid(
      tokens,
      diagnostics,
      expr.start,
      expr.length,
      '`tray` gives you text (the tray size, e.g. "20 x 30 cm"), so it ' +
        `can't be used in ${context}. Use it on its own: {{ tray }}.`,
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
  fix?: StepBodyDiagnostic["fix"],
): void {
  if (length <= 0) return;
  tokens.push({
    start,
    end: start + length,
    label: "tpl-invalid",
    priority: 10,
  });
  diagnostics.push({ start, end: start + length, message, fix });
}

/**
 * "There's no ingredient called `buttr`", with the near-match named, and
 * offered as a one-click fix, since the list of valid keys is right there.
 */
function pushUnknownKey(
  tokens: HighlightToken[],
  diagnostics: StepBodyDiagnostic[],
  ctx: StepBodyContext,
  name: string,
  range: { start: number; length: number },
  fixRange: { start: number; end: number },
): void {
  const suggestion = nearestKey(name, ctx.ingredientKeys);
  pushInvalid(
    tokens,
    diagnostics,
    range.start,
    range.length,
    `There's no ingredient called \`${name}\`. ` +
      (suggestion
        ? `Did you mean \`${suggestion}\`?`
        : "Add it to the ingredients list above, " +
          "or check that the spelling matches."),
    suggestion
      ? {
        ...fixRange,
        replacement: suggestion,
        label: `Change to ${suggestion}`,
      }
      : undefined,
  );
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
