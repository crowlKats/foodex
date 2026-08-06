import { assertEquals } from "@std/assert";
import { stepDiagnostics } from "./validate-refs.ts";

function recipe(
  keys: string[],
  bodies: string[],
): Record<string, unknown> {
  return {
    ingredients: keys.map((key) => ({ key, name: key, unit: "g" })),
    steps: bodies.map((body, i) => ({ id: `s${i}`, title: "", body })),
  };
}

Deno.test("stepDiagnostics: matching refs pass", () => {
  const r = recipe(
    ["flour", "mango_mashed"],
    ["Mix {{ flour }} with {{ mango_mashed }}.", "No refs here."],
  );
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings, []);
});

Deno.test("stepDiagnostics: an orphaned ref is an error", () => {
  // The banana → mango swap failure mode: the step was rewritten but the
  // ingredient row kept its old key.
  const r = recipe(
    ["mango_mashed"],
    ["Peel and pit {{ mangos }}, then mash."],
  );
  const d = stepDiagnostics(r);
  assertEquals(d.errors.length, 1);
  assertEquals(d.errors[0].includes("mangos"), true);
});

Deno.test("stepDiagnostics: capitalized refs and property access resolve", () => {
  const r = recipe(
    ["flour"],
    ["Add {{ Flour }} and check {{ flour.name }} quality."],
  );
  assertEquals(stepDiagnostics(r).errors, []);
});

Deno.test("stepDiagnostics: refs inside expressions are checked", () => {
  const r = recipe(
    ["flour"],
    ["Use {{ round(flour / 2 + sugar) }} for the sponge."],
  );
  const d = stepDiagnostics(r);
  assertEquals(d.errors.length >= 1, true);
  assertEquals(d.errors.some((e) => e.includes("sugar")), true);
});

Deno.test("stepDiagnostics: .name in math is an error", () => {
  const r = recipe(
    ["flour"],
    ["Add {{ flour.name * 2 }} to the bowl."],
  );
  assertEquals(stepDiagnostics(r).errors.length >= 1, true);
});

Deno.test("stepDiagnostics: a literal amount naming an ingredient warns", () => {
  const r = recipe(
    ["butter"],
    ["Melt 50 g butter in a pan."],
  );
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 1);
});

Deno.test("stepDiagnostics: {{ tray }} is a known ref, but not in math", () => {
  const ok = recipe(["flour"], ["Pour into a {{ tray }} tray."]);
  assertEquals(stepDiagnostics(ok).errors, []);
  const bad = recipe(["flour"], ["Use {{ tray * 2 }} of space."]);
  assertEquals(stepDiagnostics(bad).errors.length, 1);
});
