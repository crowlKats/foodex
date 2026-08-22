import { assert, assertEquals } from "@std/assert";
import type { QueryFn } from "../db/mod.ts";
import { addPlanEntry, cookNow, recipeIsVisible } from "./plan.ts";

const RECIPE = "11111111-1111-1111-1111-111111111111";
const HOUSEHOLD = "22222222-2222-2222-2222-222222222222";
const DISH = "33333333-3333-3333-3333-333333333333";

function fakeDb(opts: { visible: boolean }): {
  query: QueryFn;
  calls: { text: string; params?: unknown[] }[];
} {
  const calls: { text: string; params?: unknown[] }[] = [];
  const query = ((text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.includes("FROM recipes") && text.includes("private")) {
      return Promise.resolve({ rows: opts.visible ? [{}] : [] });
    }
    if (text.includes("INSERT INTO plan_entries")) {
      return Promise.resolve({ rows: [{ id: "entry-1" }] });
    }
    throw new Error(`unexpected query: ${text}`);
  }) as QueryFn;
  return { query, calls };
}

function inserted(db: { calls: { text: string }[] }): boolean {
  return db.calls.some((c) => c.text.includes("INSERT INTO plan_entries"));
}

Deno.test("recipeIsVisible: asks with the caller household", async () => {
  const db = fakeDb({ visible: true });
  assertEquals(await recipeIsVisible(db, RECIPE, HOUSEHOLD), true);
  assertEquals(db.calls.length, 1);
  assertEquals(db.calls[0].params, [RECIPE, HOUSEHOLD]);
  assert(
    db.calls[0].text.includes("private = false OR household_id"),
    "visibility predicate must match pinPlanEntry",
  );
});

Deno.test("recipeIsVisible: rejects when the query returns no row", async () => {
  const db = fakeDb({ visible: false });
  assertEquals(await recipeIsVisible(db, RECIPE, HOUSEHOLD), false);
});

Deno.test("addPlanEntry: refuses a recipe the household cannot see", async () => {
  const db = fakeDb({ visible: false });
  const id = await addPlanEntry(db, {
    householdId: HOUSEHOLD,
    recipeId: RECIPE,
  });
  assertEquals(id, null);
  assertEquals(inserted(db), false);
});

Deno.test("addPlanEntry: inserts when the recipe is visible", async () => {
  const db = fakeDb({ visible: true });
  const id = await addPlanEntry(db, {
    householdId: HOUSEHOLD,
    recipeId: RECIPE,
  });
  assertEquals(id, "entry-1");
  assertEquals(inserted(db), true);
});

Deno.test("addPlanEntry: dish-only entries skip the recipe visibility check", async () => {
  const db = fakeDb({ visible: false });
  const id = await addPlanEntry(db, {
    householdId: HOUSEHOLD,
    dishId: DISH,
  });
  assertEquals(id, "entry-1");
  assertEquals(
    db.calls.some((c) => c.text.includes("FROM recipes")),
    false,
  );
});

Deno.test("cookNow: does not cook a recipe the household cannot see", async () => {
  const db = fakeDb({ visible: false });
  const result = await cookNow(db, {
    householdId: HOUSEHOLD,
    recipeId: RECIPE,
  });
  assertEquals(result.ok, false);
  assertEquals(result.entryId, "");
  assertEquals(inserted(db), false);
});
