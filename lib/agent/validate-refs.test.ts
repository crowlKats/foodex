import { assertEquals } from "@std/assert";
import { unknownTemplateRefs } from "./validate-refs.ts";

function recipe(
  keys: string[],
  bodies: string[],
): Record<string, unknown> {
  return {
    ingredients: keys.map((key) => ({ key, name: key })),
    steps: bodies.map((body, i) => ({ id: `s${i}`, title: "", body })),
  };
}

Deno.test("unknownTemplateRefs: matching refs pass", () => {
  const r = recipe(
    ["flour", "mango_mashed"],
    ["Mix {{ flour }} with {{ mango_mashed }}.", "No refs here."],
  );
  assertEquals(unknownTemplateRefs(r), []);
});

Deno.test("unknownTemplateRefs: an orphaned ref is reported", () => {
  // The banana → mango swap failure mode: the step was rewritten but the
  // ingredient row kept its old key.
  const r = recipe(
    ["mango_mashed"],
    ["Peel and pit {{ mangos }}, then mash."],
  );
  const problems = unknownTemplateRefs(r);
  assertEquals(problems.length, 1);
  assertEquals(problems[0].includes("{{ mangos }}"), true);
});

Deno.test("unknownTemplateRefs: capitalized refs and property access resolve", () => {
  const r = recipe(
    ["flour"],
    ["Add {{ Flour }} — you need {{ flour.amount }} in total."],
  );
  assertEquals(unknownTemplateRefs(r), []);
});

Deno.test("unknownTemplateRefs: refs inside expressions are checked", () => {
  const r = recipe(
    ["flour"],
    ["Use {{ round(flour / 2 + sugar) }} for the sponge."],
  );
  const problems = unknownTemplateRefs(r);
  assertEquals(problems.length, 1);
  assertEquals(problems[0].includes('"sugar"'), true);
});
