import { assert, assertEquals } from "@std/assert";
import {
  applyPatch,
  changedPaths,
  deepEqual,
  diffToOps,
  INGREDIENT_SCHEMA,
  overlappingChangedPaths,
  type PatchOp,
  pathOf,
  RECIPE_SCHEMA,
} from "./merge.ts";

function baseRecipe() {
  return {
    title: "Pancakes",
    prep_time: 10,
    ingredients: [
      { key: "flour", name: "Flour", amount: "200", unit: "g" },
      { key: "milk", name: "Milk", amount: "300", unit: "ml" },
    ],
    steps: [
      { id: "s1", title: "Mix", body: "Mix it" },
      { id: "s2", title: "Fry", body: "Fry it" },
    ],
    tags: [{ tag_type: "meal_type", tag_value: "breakfast" }],
  };
}

Deno.test("applyPatch: scalar set", () => {
  const out = applyPatch(baseRecipe(), [
    { op: "set", path: "title", value: "Fluffy Pancakes" },
  ]);
  assertEquals(out.title, "Fluffy Pancakes");
  assertEquals(out.prep_time, 10);
});

Deno.test("applyPatch: collection set field by key", () => {
  const out = applyPatch(baseRecipe(), [
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "amount",
      value: "250",
    },
  ]);
  assertEquals(out.ingredients[0].amount, "250");
  assertEquals(out.ingredients[1].amount, "300");
});

Deno.test("applyPatch: add is replace-or-append (idempotent by key)", () => {
  const add: PatchOp = {
    op: "add",
    collection: "ingredients",
    value: { key: "sugar", name: "Sugar", amount: "50", unit: "g" },
  };
  const out = applyPatch(baseRecipe(), [add, add]);
  assertEquals(out.ingredients.length, 3);
  assertEquals(out.ingredients[2].key, "sugar");
});

Deno.test("applyPatch: remove by key", () => {
  const out = applyPatch(baseRecipe(), [
    { op: "remove", collection: "ingredients", key: "milk" },
  ]);
  assertEquals(out.ingredients.map((i) => i.key), ["flour"]);
});

Deno.test("applyPatch: reorder by keys, unknowns sink to the end", () => {
  const out = applyPatch(baseRecipe(), [
    { op: "reorder", collection: "steps", order: ["s2", "s1"] },
  ]);
  assertEquals(out.steps.map((s) => s.id), ["s2", "s1"]);
});

Deno.test("applyPatch: does not mutate the base", () => {
  const base = baseRecipe();
  applyPatch(base, [{ op: "set", path: "title", value: "X" }]);
  assertEquals(base.title, "Pancakes");
});

Deno.test("changedPaths: scalar, item, and order changes", () => {
  const base = baseRecipe();
  const live = applyPatch(base, [
    { op: "set", path: "prep_time", value: 20 },
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "amount",
      value: "999",
    },
    { op: "reorder", collection: "steps", order: ["s2", "s1"] },
  ]);
  const cp = changedPaths(base, live, RECIPE_SCHEMA);
  assert(cp.has("prep_time"));
  assert(cp.has("ingredients[flour]"));
  assert(cp.has("steps.__order"));
  assert(!cp.has("ingredients[milk]"));
});

Deno.test("merge: disjoint concurrent change is clean (no conflict)", () => {
  const base = baseRecipe();
  // live changed prep_time; our ops touch a different ingredient field
  const live = applyPatch(base, [{ op: "set", path: "prep_time", value: 20 }]);
  const ops: PatchOp[] = [
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "amount",
      value: "250",
    },
  ];
  assertEquals(overlappingChangedPaths(base, live, ops, RECIPE_SCHEMA), []);
});

Deno.test("merge: overlapping field change conflicts", () => {
  const base = baseRecipe();
  const live = applyPatch(base, [
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "amount",
      value: "999",
    },
  ]);
  const ops: PatchOp[] = [
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "amount",
      value: "250",
    },
  ];
  const conflicts = overlappingChangedPaths(base, live, ops, RECIPE_SCHEMA);
  assertEquals(conflicts, ["ingredients[flour].amount"]);
});

Deno.test("merge: whole-item change conflicts with a field op (prefix overlap)", () => {
  const base = baseRecipe();
  // live removed flour entirely -> ingredients[flour] changed
  const live = applyPatch(base, [
    { op: "remove", collection: "ingredients", key: "flour" },
  ]);
  const ops: PatchOp[] = [
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "unit",
      value: "kg",
    },
  ];
  const conflicts = overlappingChangedPaths(base, live, ops, RECIPE_SCHEMA);
  assertEquals(conflicts, ["ingredients[flour].unit"]);
});

Deno.test("merge: same key added on both sides conflicts", () => {
  const base = baseRecipe();
  const live = applyPatch(base, [
    {
      op: "add",
      collection: "ingredients",
      value: { key: "sugar", name: "Sugar", amount: "10", unit: "g" },
    },
  ]);
  const ops: PatchOp[] = [
    {
      op: "add",
      collection: "ingredients",
      value: { key: "sugar", name: "Sugar", amount: "50", unit: "g" },
    },
  ];
  const conflicts = overlappingChangedPaths(base, live, ops, RECIPE_SCHEMA);
  assertEquals(conflicts, ["ingredients[sugar]"]);
});

Deno.test("ingredient schema: flat scalar merge", () => {
  const base = { name: "Flour", unit: "g", density: 0.5 };
  const live = { name: "Flour", unit: "g", density: 0.6 };
  const ops: PatchOp[] = [{ op: "set", path: "name", value: "Bread Flour" }];
  // live changed density, ops change name -> disjoint, clean
  assertEquals(overlappingChangedPaths(base, live, ops, INGREDIENT_SCHEMA), []);
  // now conflict on density
  const ops2: PatchOp[] = [{ op: "set", path: "density", value: 0.7 }];
  assertEquals(
    overlappingChangedPaths(base, live, ops2, INGREDIENT_SCHEMA),
    ["density"],
  );
});

Deno.test("pathOf: signatures", () => {
  assertEquals(pathOf({ op: "set", path: "title", value: 1 }), "title");
  assertEquals(
    pathOf({
      op: "set",
      collection: "steps",
      key: "s1",
      field: "body",
      value: "x",
    }),
    "steps[s1].body",
  );
  assertEquals(
    pathOf({ op: "remove", collection: "steps", key: "s1" }),
    "steps[s1]",
  );
  assertEquals(
    pathOf({ op: "reorder", collection: "steps", order: [] }),
    "steps.__order",
  );
  assertEquals(
    pathOf({
      op: "add",
      collection: "tags",
      value: { tag_type: "dietary", tag_value: "vegan" },
    }),
    "tags[dietary:vegan]",
  );
});

Deno.test("diffToOps: roundtrips through applyPatch", () => {
  const base = baseRecipe();
  const edited = applyPatch(base, [
    { op: "set", path: "title", value: "New Title" },
    {
      op: "set",
      collection: "ingredients",
      key: "flour",
      field: "amount",
      value: "250",
    },
    { op: "remove", collection: "ingredients", key: "milk" },
    {
      op: "add",
      collection: "steps",
      value: { id: "s3", title: "Serve", body: "Serve" },
    },
    { op: "reorder", collection: "steps", order: ["s2", "s1", "s3"] },
  ]);
  const ops = diffToOps(base, edited, RECIPE_SCHEMA);
  assert(deepEqual(applyPatch(base, ops), edited));
});

Deno.test("diffToOps: scalar array field (tags) replaced whole", () => {
  const oldO = { title: "A", meal_types: ["breakfast"] };
  const newO = { title: "A", meal_types: ["lunch", "dinner"] };
  const ops = diffToOps(oldO, newO, RECIPE_SCHEMA);
  assertEquals(ops, [{
    op: "set",
    path: "meal_types",
    value: ["lunch", "dinner"],
  }]);
});

Deno.test("deepEqual: nested + arrays", () => {
  assert(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
  assert(!deepEqual({ a: 1 }, { a: 1, b: 2 }));
  assert(!deepEqual([1, 2], [2, 1]));
});
