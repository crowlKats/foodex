import { assert, assertEquals } from "@std/assert";
import { parseExpression, parseTemplate } from "./parser.ts";
import type { Expr, TemplateNode } from "./ast.ts";

// ── Position helpers ───────────────────────────────────────────────────────

function rangeText(
  source: string,
  node: { start: number; length: number },
): string {
  return source.slice(node.start, node.start + node.length);
}

// ── Template structure ─────────────────────────────────────────────────────

Deno.test("parseTemplate: plain text only", () => {
  const ast = parseTemplate("just some text");
  assertEquals(ast.nodes.length, 1);
  assertEquals(ast.nodes[0].kind, "text");
  if (ast.nodes[0].kind === "text") {
    assertEquals(ast.nodes[0].value, "just some text");
    assertEquals(ast.nodes[0].start, 0);
    assertEquals(ast.nodes[0].length, 14);
  }
});

Deno.test("parseTemplate: empty input yields zero nodes", () => {
  const ast = parseTemplate("");
  assertEquals(ast.nodes.length, 0);
  assertEquals(ast.length, 0);
});

Deno.test("parseTemplate: text + interpolation + text", () => {
  const src = "Use {{ flour }} grams.";
  const ast = parseTemplate(src);
  assertEquals(ast.nodes.length, 3);
  assertEquals(ast.nodes[0].kind, "text");
  assertEquals(ast.nodes[1].kind, "interpolation");
  assertEquals(ast.nodes[2].kind, "text");
  // Range round-trip: concatenating ranges reproduces the source.
  const joined = ast.nodes.map((n) => rangeText(src, n)).join("");
  assertEquals(joined, src);
});

Deno.test("parseTemplate: interpolation expression has correct positions", () => {
  const src = "Use {{ flour * 2 }} grams.";
  const ast = parseTemplate(src);
  const interp = ast.nodes[1];
  assert(interp.kind === "interpolation");
  // The exprRange should point at `flour * 2`.
  assertEquals(rangeText(src, interp.exprRange), "flour * 2");
  // The interpolation node should include the braces.
  assertEquals(rangeText(src, interp), "{{ flour * 2 }}");
  // Walking the expression tree, positions should be inside the original source.
  assert(interp.expr.kind === "binary");
  assertEquals(rangeText(src, interp.expr.left), "flour");
  assertEquals(rangeText(src, interp.expr.opRange), "*");
  assertEquals(rangeText(src, interp.expr.right), "2");
});

// ── The tricky markdown interaction ────────────────────────────────────────

Deno.test("parseTemplate: `*` inside `{{ }}` does not break italic boundaries", () => {
  // In `*bar {{ foo * 2 }}*` the inner `*` is a multiplication operator,
  // not an italic delimiter. The template parser should fully consume the
  // interpolation so the outer `*` … `*` italic markers remain intact.
  const src = "*bar {{ foo * 2 }}*";
  const ast = parseTemplate(src);
  assertEquals(ast.nodes.length, 3);
  assertEquals(ast.nodes[0].kind, "text");
  assertEquals(ast.nodes[1].kind, "interpolation");
  assertEquals(ast.nodes[2].kind, "text");
  if (ast.nodes[0].kind === "text") assertEquals(ast.nodes[0].value, "*bar ");
  if (ast.nodes[2].kind === "text") assertEquals(ast.nodes[2].value, "*");
  // And the expression must be `foo * 2`, not partially parsed.
  if (ast.nodes[1].kind === "interpolation") {
    assert(ast.nodes[1].expr.kind === "binary");
    assertEquals(ast.nodes[1].expr.op, "*");
  }
});

Deno.test("parseTemplate: interpolation inside bold delimiters", () => {
  const src = "**bold {{ x }}**";
  const ast = parseTemplate(src);
  // Should be: text("**bold "), interpolation, text("**")
  assertEquals(ast.nodes.length, 3);
  assertEquals(
    (ast.nodes[0] as TemplateNode & { kind: "text" }).value,
    "**bold ",
  );
  assertEquals((ast.nodes[2] as TemplateNode & { kind: "text" }).value, "**");
});

// ── Step references ────────────────────────────────────────────────────────

Deno.test("parseTemplate: @step(3) global reference", () => {
  const src = "see @step(3)";
  const ast = parseTemplate(src);
  const ref = ast.nodes[1];
  assert(ref.kind === "step_ref");
  assertEquals(ref.number, 3);
  assertEquals(rangeText(src, ref), "@step(3)");
  assertEquals(rangeText(src, ref.numberRange), "3");
});

Deno.test("parseTemplate: @step(sauce.2) section reference", () => {
  const src = "see @step(sauce.2)";
  const ast = parseTemplate(src);
  const ref = ast.nodes[1];
  assert(ref.kind === "step_ref_section");
  assertEquals(ref.sectionKey, "sauce");
  assertEquals(ref.number, 2);
  assertEquals(rangeText(src, ref.sectionKeyRange), "sauce");
  assertEquals(rangeText(src, ref.numberRange), "2");
});

Deno.test("parseTemplate: @step(garbage) is an invalid directive", () => {
  const src = "@step(garbage)";
  const ast = parseTemplate(src);
  assertEquals(ast.nodes.length, 1);
  assertEquals(ast.nodes[0].kind, "invalid_directive");
  if (ast.nodes[0].kind === "invalid_directive") {
    assertEquals(ast.nodes[0].raw, "@step(garbage)");
  }
});

// ── Timers ─────────────────────────────────────────────────────────────────

Deno.test("parseTemplate: @timer(15m) parses to seconds", () => {
  const src = "wait @timer(15m)";
  const ast = parseTemplate(src);
  const t = ast.nodes[1];
  assert(t.kind === "timer");
  assertEquals(t.duration, "15m");
  assertEquals(t.seconds, 900);
});

Deno.test("parseTemplate: @timer(1h30m45s) compounds", () => {
  const ast = parseTemplate("@timer(1h30m45s)");
  const t = ast.nodes[0];
  assert(t.kind === "timer");
  assertEquals(t.seconds, 3600 + 30 * 60 + 45);
});

Deno.test("parseTemplate: @timer(abc) is invalid", () => {
  const ast = parseTemplate("@timer(abc)");
  assertEquals(ast.nodes[0].kind, "invalid_directive");
});

Deno.test("parseTemplate: @timer(4-6m) is a range to the lower bound", () => {
  const ast = parseTemplate("@timer(4-6m)");
  const t = ast.nodes[0];
  assert(t.kind === "timer");
  assertEquals(t.duration, "4-6m");
  assertEquals(t.seconds, 240);
  assertEquals(t.secondsMax, 360);
});

Deno.test("parseTemplate: @timer(1h-1h30m) full-duration range", () => {
  const ast = parseTemplate("@timer(1h-1h30m)");
  const t = ast.nodes[0];
  assert(t.kind === "timer");
  assertEquals(t.seconds, 3600);
  assertEquals(t.secondsMax, 5400);
});

Deno.test("parseTemplate: bad timer ranges are invalid", () => {
  // Descending, equal, bare-number lower with a compound upper (ambiguous
  // unit), and a unitless upper are all rejected.
  for (const src of ["6-4m", "5-5m", "4-1h30m", "4-6"]) {
    const ast = parseTemplate(`@timer(${src})`);
    assertEquals(ast.nodes[0].kind, "invalid_directive", src);
  }
});

// ── Recipe references ──────────────────────────────────────────────────────

Deno.test("parseTemplate: @recipe(some-slug)", () => {
  const src = "see @recipe(my-pizza-dough)";
  const ast = parseTemplate(src);
  const ref = ast.nodes[1];
  assert(ref.kind === "recipe_ref");
  assertEquals(ref.slug, "my-pizza-dough");
});

Deno.test("parseTemplate: @recipe(BAD CAPS) is invalid", () => {
  const ast = parseTemplate("@recipe(BadSlug)");
  assertEquals(ast.nodes[0].kind, "invalid_directive");
});

// ── Dish references ────────────────────────────────────────────────────────

Deno.test("parseTemplate: @dish(some-slug)", () => {
  const src = "use any @dish(pizza-dough)";
  const ast = parseTemplate(src);
  const ref = ast.nodes[1];
  assert(ref.kind === "dish_ref");
  assertEquals(ref.slug, "pizza-dough");
});

Deno.test("parseTemplate: @dish(BAD CAPS) is invalid", () => {
  const ast = parseTemplate("@dish(BadSlug)");
  assertEquals(ast.nodes[0].kind, "invalid_directive");
});

// ── Unknown @-words pass through as text ───────────────────────────────────

Deno.test("parseTemplate: @username(at-style stuff) stays as text", () => {
  const src = "ping @alice for help";
  const ast = parseTemplate(src);
  // No directive is recognised → entire input is a single text node.
  assertEquals(ast.nodes.length, 1);
  assertEquals(ast.nodes[0].kind, "text");
});

// ── Invalid nodes for malformed input ──────────────────────────────────────

Deno.test("parseTemplate: unterminated `{{`", () => {
  const src = "oops {{ flour";
  const ast = parseTemplate(src);
  // text, then invalid_directive consuming the rest.
  assertEquals(ast.nodes.length, 2);
  assertEquals(ast.nodes[1].kind, "invalid_directive");
});

Deno.test("parseTemplate: empty `{{ }}` is an invalid expression", () => {
  const src = "{{ }}";
  const ast = parseTemplate(src);
  const i = ast.nodes[0];
  assert(i.kind === "interpolation");
  assertEquals(i.expr.kind, "invalid_expr");
});

Deno.test("parseTemplate: `{{ 2 + }}` produces an invalid sub-expr", () => {
  const src = "{{ 2 + }}";
  const ast = parseTemplate(src);
  const i = ast.nodes[0];
  assert(i.kind === "interpolation");
  // Top-level is a binary whose right operand is invalid.
  assert(i.expr.kind === "binary");
  assertEquals(i.expr.right.kind, "invalid_expr");
});

Deno.test("parseTemplate: `{{ 2 + + 3 }}` flags the broken expression", () => {
  const ast = parseTemplate("{{ 2 + + 3 }}");
  const i = ast.nodes[0];
  assert(i.kind === "interpolation");
  // `+` is not a valid prefix operator, so the parse fails. Either we get a
  // top-level invalid wrapper or a binary whose right side carries the error.
  // Either is fine for highlighting purposes; we just want the error visible.
  const hasInvalid = (e: Expr): boolean => {
    if (e.kind === "invalid_expr") return true;
    if (e.kind === "binary") return hasInvalid(e.left) || hasInvalid(e.right);
    if (e.kind === "unary") return hasInvalid(e.operand);
    if (e.kind === "call") return e.args.some(hasInvalid);
    return false;
  };
  assert(hasInvalid(i.expr));
});

// ── Expression structure ───────────────────────────────────────────────────

Deno.test("parseExpression: operator precedence", () => {
  const expr = parseExpression("1 + 2 * 3");
  // Should parse as 1 + (2 * 3)
  assert(expr.kind === "binary");
  assertEquals(expr.op, "+");
  assert(expr.right.kind === "binary");
  assertEquals(expr.right.op, "*");
});

Deno.test("parseExpression: parentheses override precedence", () => {
  const expr = parseExpression("(1 + 2) * 3");
  assert(expr.kind === "binary");
  assertEquals(expr.op, "*");
  assert(expr.left.kind === "binary");
  assertEquals(expr.left.op, "+");
});

Deno.test("parseExpression: unary minus", () => {
  const expr = parseExpression("-x");
  assert(expr.kind === "unary");
  assertEquals(expr.op, "-");
});

Deno.test("parseExpression: function call with multiple args", () => {
  const expr = parseExpression("max(1, 2, 3)");
  assert(expr.kind === "call");
  assertEquals(expr.name, "max");
  assertEquals(expr.args.length, 3);
});

Deno.test("parseExpression: property access", () => {
  const expr = parseExpression("flour.name");
  assert(expr.kind === "property");
  assertEquals(expr.object, "flour");
  assertEquals(expr.property, "name");
});

Deno.test("parseExpression: decimal numbers", () => {
  const a = parseExpression("0.5");
  assert(a.kind === "number");
  assertEquals(a.value, 0.5);
  const b = parseExpression(".25");
  assert(b.kind === "number");
  assertEquals(b.value, 0.25);
});

Deno.test("parseExpression: offset is honoured in positions", () => {
  const expr = parseExpression("flour", 100);
  assertEquals(expr.start, 100);
  assertEquals(expr.length, 5);
});

Deno.test("parseExpression: trailing garbage produces invalid wrapper", () => {
  const expr = parseExpression("1 2");
  assertEquals(expr.kind, "invalid_expr");
});

// ── Multiple directives in one body ────────────────────────────────────────

Deno.test("parseTemplate: many directives in sequence", () => {
  const src = "Mix {{ flour }} g flour, wait @timer(5m), see @step(2).";
  const ast = parseTemplate(src);
  const kinds = ast.nodes.map((n) => n.kind);
  assertEquals(kinds, [
    "text",
    "interpolation",
    "text",
    "timer",
    "text",
    "step_ref",
    "text",
  ]);
});

// ── Position invariants ────────────────────────────────────────────────────

Deno.test("parseTemplate: every node's range is in-bounds and contiguous", () => {
  const src =
    "Add {{ flour * 2 }} grams. *Then* heat @timer(10m) and check @step(sauce.1).";
  const ast = parseTemplate(src);
  let cursor = 0;
  for (const n of ast.nodes) {
    assertEquals(
      n.start,
      cursor,
      `gap at ${cursor}, node starts at ${n.start}`,
    );
    assert(n.length >= 0);
    assert(n.start + n.length <= src.length);
    cursor = n.start + n.length;
  }
  assertEquals(cursor, src.length);
});

Deno.test("parseTemplate: expression sub-positions cover only the expression", () => {
  const src = "x = {{ foo(1, 2) + 3 }}";
  const ast = parseTemplate(src);
  const interp = ast.nodes.find((n) => n.kind === "interpolation");
  assert(interp && interp.kind === "interpolation");
  const e: Expr = interp.expr;
  assert(e.kind === "binary");
  assertEquals(rangeText(src, e.left), "foo(1, 2)");
  assertEquals(rangeText(src, e.right), "3");
});
