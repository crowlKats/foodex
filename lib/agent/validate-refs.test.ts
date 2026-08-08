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

Deno.test("stepDiagnostics: duplicate ingredient rows warn", () => {
  // Per-use rows of the same ingredient: same name, and same entity id under
  // a different name. Both are one duplication, reported once each.
  const r: Record<string, unknown> = {
    ingredients: [
      { key: "bottarga", name: "Bottarga di muggine", unit: "g" },
      { key: "bottarga_for_crumb", name: "Bottarga di muggine", unit: "g" },
      { key: "butter", name: "Butter", unit: "g", ingredient_id: "id-1" },
      {
        key: "butter_cold",
        name: "Cold butter",
        unit: "g",
        ingredient_id: "id-1",
      },
      { key: "flour", name: "Flour", unit: "g" },
    ],
    steps: [{ id: "s0", title: "", body: "No refs." }],
  };
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 2);
  assertEquals(d.warnings[0].includes("bottarga_for_crumb"), true);
  assertEquals(d.warnings[1].includes("butter_cold"), true);
});

Deno.test("stepDiagnostics: a key unrelated to its name warns", () => {
  const r: Record<string, unknown> = {
    ingredients: [
      // The garbled-import case: a row whose name belongs to another row.
      { key: "pasta_cooking_water", name: "Lemon", unit: "g" },
      // Derived keys are fine, including partial and plural/singular matches.
      { key: "flour", name: "All-purpose flour", unit: "g" },
      { key: "eggs", name: "Egg", unit: "pcs" },
    ],
    steps: [{ id: "s0", title: "", body: "No refs." }],
  };
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 1);
  assertEquals(d.warnings[0].includes("pasta_cooking_water"), true);
});

Deno.test("stepDiagnostics: a full ref with prose duplication warns", () => {
  const r: Record<string, unknown> = {
    ingredients: [
      {
        key: "burnt_lemon_juice",
        name: "Burnt lemon juice",
        unit: "g",
        intermediate: true,
      },
      { key: "unsalted_butter", name: "Unsalted butter", unit: "g" },
    ],
    steps: [
      // Renders "10 g burnt lemon juice of the burnt lemon juice".
      {
        id: "s0",
        title: "",
        body:
          "Reserve {{ burnt_lemon_juice }} of the burnt lemon juice for later.",
      },
      // Renders "110 g of 120 g unsalted butter".
      { id: "s1", title: "", body: "Place 110 g of {{ unsalted_butter }}." },
    ],
  };
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 2);
  assertEquals(d.warnings[0].includes("repeats the name"), true);
  assertEquals(d.warnings[1].includes("unsalted_butter.name"), true);
});

Deno.test("stepDiagnostics: literal amounts match partial names", () => {
  const r: Record<string, unknown> = {
    ingredients: [
      { key: "bottarga", name: "Bottarga di muggine", unit: "g" },
      { key: "pasta_water", name: "Pasta cooking water", unit: "g" },
    ],
    steps: [
      { id: "s0", title: "", body: "Mix in 25 g grated bottarga." },
      { id: "s1", title: "", body: "Add 100 g of pasta water and toss." },
      // A duration mentioning a name word must stay quiet.
      {
        id: "s2",
        title: "",
        body: "Wait 2 minutes until the water boils, then drain.",
      },
    ],
  };
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  const literal = d.warnings.filter((w) => w.includes("typed out"));
  assertEquals(literal.length, 2);
  assertEquals(literal[0].includes("bottarga"), true);
  assertEquals(literal[1].includes("pasta_water"), true);
});

Deno.test("stepDiagnostics: a derived-looking linked row suggests intermediate", () => {
  const r: Record<string, unknown> = {
    ingredients: [
      { key: "burnt_lemon_juice", name: "Burnt lemon juice", unit: "g" },
      // Flagged rows and ordinary names stay quiet.
      {
        key: "browned_butter",
        name: "Browned butter",
        unit: "g",
        intermediate: true,
      },
      { key: "butter", name: "Butter", unit: "g" },
    ],
    steps: [{ id: "s0", title: "", body: "No refs." }],
  };
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 1);
  assertEquals(d.warnings[0].includes("Burnt lemon juice"), true);
  assertEquals(d.warnings[0].includes("intermediate"), true);
});

Deno.test("stepDiagnostics: an unknown unit warns", () => {
  const r: Record<string, unknown> = {
    ingredients: [
      { key: "garlic_clove", name: "Garlic clove", amount: "1", unit: "small" },
      { key: "flour", name: "Flour", amount: "200", unit: "g" },
    ],
    steps: [{ id: "s0", title: "", body: "No refs." }],
  };
  const d = stepDiagnostics(r);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 1);
  assertEquals(d.warnings[0].includes('unknown unit "small"'), true);
});

Deno.test("stepDiagnostics: a stated duration without a timer warns", () => {
  const bare = recipe(["flour"], [
    "Cook for 4-6 minutes until fragrant.",
  ]);
  const d = stepDiagnostics(bare);
  assertEquals(d.errors, []);
  assertEquals(d.warnings.length, 1);
  assertEquals(d.warnings[0].includes("@timer(4-6m)"), true);

  // A duration already carried by a timer stays quiet, as does vague
  // timing with no number.
  const covered = recipe(["flour"], [
    "Cook for @timer(4-6m) until fragrant.",
    "Stir for a few minutes until glossy.",
  ]);
  assertEquals(stepDiagnostics(covered).warnings, []);
});

Deno.test("stepDiagnostics: {{ tray }} is a known ref, but not in math", () => {
  const ok = recipe(["flour"], ["Pour into a {{ tray }} tray."]);
  assertEquals(stepDiagnostics(ok).errors, []);
  const bad = recipe(["flour"], ["Use {{ tray * 2 }} of space."]);
  assertEquals(stepDiagnostics(bad).errors.length, 1);
});
