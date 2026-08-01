import { assert, assertEquals } from "@std/assert";
import {
  computeAvailability,
  findDuplicates,
  isAvailable,
  matchKey,
  planConsumption,
  selectStock,
  type StockRow,
  sumAmounts,
} from "./inventory.ts";

const FLOUR = "11111111-1111-1111-1111-111111111111";
const MILK = "22222222-2222-2222-2222-222222222222";

Deno.test("matchKey: linked rows key on the ingredient, not the name", () => {
  assertEquals(
    matchKey({ ingredient_id: FLOUR, name: "Flour" }),
    matchKey({ ingredient_id: FLOUR, name: "flour, plain" }),
  );
});

Deno.test("matchKey: unlinked rows normalize the name", () => {
  assertEquals(
    matchKey({ name: "  Plain   Flour " }),
    matchKey({ name: "plain flour" }),
  );
});

Deno.test("selectStock: id matches shadow name matches", () => {
  const rows: StockRow[] = [
    { id: "a", ingredient_id: FLOUR, name: "Flour", amount: 500, unit: "g" },
    { id: "b", name: "flour", amount: 200, unit: "g" },
  ];
  const picked = selectStock({ ingredient_id: FLOUR, name: "Flour" }, rows);
  assertEquals(picked.map((r) => r.id), ["a"]);
});

Deno.test("selectStock: soonest-expiring first, undated last", () => {
  const rows: StockRow[] = [
    { id: "none", name: "Milk", amount: 1, unit: "l" },
    {
      id: "late",
      name: "Milk",
      amount: 1,
      unit: "l",
      expires_at: "2026-09-01",
    },
    {
      id: "soon",
      name: "Milk",
      amount: 1,
      unit: "l",
      expires_at: "2026-08-02",
    },
  ];
  assertEquals(
    selectStock({ name: "milk" }, rows).map((r) => r.id),
    ["soon", "late", "none"],
  );
});

Deno.test("computeAvailability: sums duplicates across units", () => {
  const rows: StockRow[] = [
    { ingredient_id: FLOUR, name: "Flour", amount: 500, unit: "g" },
    { ingredient_id: FLOUR, name: "Flour", amount: 0.5, unit: "kg" },
  ];
  const a = computeAvailability(
    { ingredient_id: FLOUR, name: "Flour", amount: 800, unit: "g" },
    rows,
  );
  assertEquals(a.have, 1000);
  assertEquals(a.needed, 0);
  assert(isAvailable(a));
});

Deno.test("computeAvailability: scale applies to the requirement", () => {
  const rows: StockRow[] = [{ name: "Flour", amount: 500, unit: "g" }];
  const a = computeAvailability(
    { name: "Flour", amount: 400, unit: "g" },
    rows,
    { scale: 2 },
  );
  assertEquals(a.required, 800);
  assertEquals(a.needed, 300);
  assertEquals(isAvailable(a), false);
});

Deno.test("computeAvailability: claimed stock is not credited twice", () => {
  const rows: StockRow[] = [{ name: "Flour", amount: 200, unit: "g" }];
  const first = computeAvailability(
    { name: "Flour", amount: 500, unit: "g" },
    rows,
  );
  assertEquals(first.needed, 300);
  // A second meal cannot spend the same 200 g the first one already claimed.
  const second = computeAvailability(
    { name: "Flour", amount: 500, unit: "g" },
    rows,
    { claimed: 200 },
  );
  assertEquals(second.needed, 500);
  assertEquals(second.have, 200);
});

Deno.test("computeAvailability: staples are unlimited", () => {
  const rows: StockRow[] = [{ name: "Salt", staple: true }];
  const a = computeAvailability({ name: "Salt", amount: 20, unit: "g" }, rows);
  assertEquals(a.needed, 0);
  assert(a.staple);
  assert(isAvailable(a));
});

Deno.test("computeAvailability: mass↔volume needs a density", () => {
  const ref = { name: "Milk", amount: 200, unit: "g", density: 1.03 };
  const withDensity = computeAvailability(ref, [
    { name: "Milk", amount: 500, unit: "ml", density: 1.03 },
  ]);
  assertEquals(Math.round(withDensity.have), 515);
  assertEquals(withDensity.unconvertible, false);

  const withoutDensity = computeAvailability({ ...ref, density: null }, [
    { name: "Milk", amount: 500, unit: "ml" },
  ]);
  assertEquals(withoutDensity.have, 0);
  assert(withoutDensity.unconvertible);
  assert(withoutDensity.present);
});

Deno.test("computeAvailability: untracked amounts read as available", () => {
  const a = computeAvailability(
    { name: "Pepper", amount: 5, unit: "g" },
    [{ name: "Pepper" }],
  );
  assert(a.present);
  assert(a.quantityUnknown);
  assertEquals(a.needed, 5);
  // The badge and the cookable filter agree: missing data is not a shortage.
  assert(isAvailable(a));
});

Deno.test("computeAvailability: nothing in stock", () => {
  const a = computeAvailability({ name: "Yeast", amount: 7, unit: "g" }, []);
  assertEquals(a.present, false);
  assertEquals(a.needed, 7);
  assertEquals(isAvailable(a), false);
});

Deno.test("planConsumption: drains soonest-expiring stock first", () => {
  const rows: StockRow[] = [
    {
      id: "late",
      name: "Milk",
      amount: 1000,
      unit: "ml",
      expires_at: "2026-09-01",
    },
    {
      id: "soon",
      name: "Milk",
      amount: 300,
      unit: "ml",
      expires_at: "2026-08-02",
    },
  ];
  const plan = planConsumption({ name: "Milk", amount: 800, unit: "ml" }, rows);
  assertEquals(plan.consumptions.map((c) => [c.row.id, c.amountInRowUnit]), [
    ["soon", 300],
    ["late", 500],
  ]);
  assertEquals(plan.consumptions[0].exhausted, true);
  assertEquals(plan.consumptions[1].exhausted, false);
  assertEquals(plan.shortfall, 0);
});

Deno.test("planConsumption: reports what it could not cover", () => {
  const plan = planConsumption(
    { name: "Flour", amount: 900, unit: "g" },
    [{ name: "Flour", amount: 0.4, unit: "kg" }],
  );
  assertEquals(plan.consumptions.length, 1);
  assertEquals(plan.consumptions[0].amountInRowUnit, 0.4);
  assertEquals(Math.round(plan.shortfall), 500);
});

Deno.test("planConsumption: unconvertible rows are skipped, not guessed at", () => {
  const plan = planConsumption(
    { name: "Milk", amount: 200, unit: "g" },
    [{ name: "Milk", amount: 500, unit: "ml" }],
  );
  assertEquals(plan.consumptions.length, 0);
  assertEquals(plan.skipped.length, 1);
  assertEquals(plan.shortfall, 200);
});

Deno.test("planConsumption: staples deduct nothing", () => {
  const plan = planConsumption(
    { name: "Salt", amount: 10, unit: "g" },
    [{ name: "Salt", staple: true }],
  );
  assertEquals(plan.consumptions.length, 0);
  assertEquals(plan.shortfall, 0);
});

Deno.test("sumAmounts: totals into one unit", () => {
  const summed = sumAmounts([
    { name: "Flour", amount: 500, unit: "g" },
    { name: "Flour", amount: 1, unit: "kg" },
  ], "g");
  assertEquals(summed.amount, 1500);
  assertEquals(summed.unit, "g");
  assertEquals(summed.unconvertible, false);
});

Deno.test("findDuplicates: merge candidates share a match key", () => {
  const rows: StockRow[] = [
    { id: "a", ingredient_id: FLOUR, name: "Flour" },
    { id: "b", ingredient_id: FLOUR, name: "Wheat flour" },
    { id: "c", ingredient_id: MILK, name: "Milk" },
  ];
  assertEquals(findDuplicates(rows[0], rows).map((r) => r.id), ["b"]);
  assertEquals(findDuplicates(rows[2], rows), []);
});
