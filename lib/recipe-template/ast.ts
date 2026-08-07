/**
 * AST for the recipe step body template syntax.
 *
 * Syntax:
 *   - Plain text (and markdown).
 *   - `{{ expr }}`: interpolation; `expr` is an arithmetic expression that may
 *     reference variables, ingredient properties, and call built-in functions.
 *   - `@step(N)` / `@step(key.N)`: step references.
 *   - `@timer(15m)` etc.: timer buttons.
 *   - `@recipe(slug)`: sub-recipe links (resolved asynchronously).
 *   - `@dish(slug)`: dish links, "any recipe for this dish".
 *
 * Every node carries (`start`, `length`) into the original source so a syntax
 * highlighter or editor tooling can map nodes back to text ranges. Parse errors
 * are not thrown; they produce `Invalid*` nodes carrying the offending range
 * and a message. This means the AST always covers the whole input.
 */

export interface Pos {
  /** Offset (in UTF-16 code units) into the original source where this node starts. */
  start: number;
  /** Number of UTF-16 code units this node spans. */
  length: number;
}

// ── Template-level nodes ────────────────────────────────────────────────────

export interface TextNode extends Pos {
  kind: "text";
  value: string;
}

export interface InterpolationNode extends Pos {
  kind: "interpolation";
  /** The parsed expression, or an invalid-expression node. */
  expr: Expr;
  /** Range of the inner expression text (excluding the surrounding `{{` `}}`). */
  exprRange: Pos;
}

export interface StepRefGlobalNode extends Pos {
  kind: "step_ref";
  number: number;
  numberRange: Pos;
}

export interface StepRefSectionNode extends Pos {
  kind: "step_ref_section";
  sectionKey: string;
  sectionKeyRange: Pos;
  number: number;
  numberRange: Pos;
}

export interface TimerNode extends Pos {
  kind: "timer";
  /** Raw duration string, e.g. `15m`, `1h30m`, or a range like `4-6m`. */
  duration: string;
  durationRange: Pos;
  /** Pre-computed total seconds; for a range, the LOWER bound (the countdown
   *  runs to it so the cook checks early). Malformed/zero durations become an
   *  `InvalidDirectiveNode` at parse time, so this is always positive. */
  seconds: number;
  /** Upper bound of a range timer, in seconds; unset for a plain timer.
   *  Always strictly greater than `seconds`. */
  secondsMax?: number;
}

export interface RecipeRefNode extends Pos {
  kind: "recipe_ref";
  slug: string;
  slugRange: Pos;
}

export interface DishRefNode extends Pos {
  kind: "dish_ref";
  slug: string;
  slugRange: Pos;
}

export interface InvalidDirectiveNode extends Pos {
  kind: "invalid_directive";
  /** Raw source covering the offending construct, including the leading `@` or `{{`. */
  raw: string;
  message: string;
}

export type TemplateNode =
  | TextNode
  | InterpolationNode
  | StepRefGlobalNode
  | StepRefSectionNode
  | TimerNode
  | RecipeRefNode
  | DishRefNode
  | InvalidDirectiveNode;

export interface TemplateAst extends Pos {
  kind: "template";
  source: string;
  nodes: TemplateNode[];
}

// ── Expression nodes ────────────────────────────────────────────────────────

export interface NumberLit extends Pos {
  kind: "number";
  value: number;
}

export interface VariableRef extends Pos {
  kind: "variable";
  name: string;
}

export interface PropertyAccess extends Pos {
  kind: "property";
  object: string;
  property: string;
  objectRange: Pos;
  propertyRange: Pos;
}

export interface BinaryOp extends Pos {
  kind: "binary";
  op: "+" | "-" | "*" | "/";
  left: Expr;
  right: Expr;
  /** Position of the operator token. */
  opRange: Pos;
}

export interface UnaryOp extends Pos {
  kind: "unary";
  op: "-";
  operand: Expr;
  opRange: Pos;
}

export interface FunctionCall extends Pos {
  kind: "call";
  name: string;
  nameRange: Pos;
  args: Expr[];
}

export interface InvalidExpr extends Pos {
  kind: "invalid_expr";
  /** Raw source spanning the failed expression range. */
  raw: string;
  message: string;
}

export type Expr =
  | NumberLit
  | VariableRef
  | PropertyAccess
  | BinaryOp
  | UnaryOp
  | FunctionCall
  | InvalidExpr;

// ── Traversal helpers ──────────────────────────────────────────────────────

/** Walk every node in the template (including expression sub-trees), in order. */
export function walk(
  ast: TemplateAst,
  visit: (node: TemplateNode | Expr) => void,
): void {
  for (const node of ast.nodes) {
    visit(node);
    if (node.kind === "interpolation") walkExpr(node.expr, visit);
  }
}

function walkExpr(expr: Expr, visit: (node: Expr) => void): void {
  visit(expr);
  switch (expr.kind) {
    case "binary":
      walkExpr(expr.left, visit);
      walkExpr(expr.right, visit);
      return;
    case "unary":
      walkExpr(expr.operand, visit);
      return;
    case "call":
      for (const a of expr.args) walkExpr(a, visit);
      return;
  }
}
