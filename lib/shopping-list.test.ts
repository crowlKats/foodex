import { assert, assertEquals } from "@std/assert";
import { type Demand, projectLines, type Purchase } from "./shopping-list.ts";
import type { StockRow } from "./inventory.ts";

const FLOUR = "11111111-1111-1111-1111-111111111111";

function planDemand(
  over: Partial<Demand> & Pick<Demand, "name">,
  label = "Pancakes",
): Demand {
  return {
    source: { kind: "plan", id: "entry-1", label, slug: "pancakes" },
    ingredient_id: null,
    amount: null,
    unit: null,
    ...over,
  };
}

Deno.test("projectLines: demand minus stock is what you buy", () => {
  const lines = projectLines(
    [planDemand({ name: "Flour", amount: 500, unit: "g" })],
    [{ name: "Flour", amount: 200, unit: "g" }],
    [],
  );
  assertEquals(lines.length, 1);
  assertEquals(lines[0].required, 500);
  assertEquals(lines[0].have, 200);
  assertEquals(lines[0].needed, 300);
});

Deno.test("projectLines: fully stocked ingredients drop off the list", () => {
  const lines = projectLines(
    [planDemand({ name: "Flour", amount: 200, unit: "g" })],
    [{ name: "Flour", amount: 900, unit: "g" }],
    [],
  );
  assertEquals(lines, []);
});

Deno.test("projectLines: the same recipe twice doubles the requirement", () => {
  const stock: StockRow[] = [{ name: "Flour", amount: 200, unit: "g" }];
  const one = projectLines(
    [planDemand({ name: "Flour", amount: 500, unit: "g" })],
    stock,
    [],
  );
  assertEquals(one[0].needed, 300);

  // Two planned meals, one pantry. The old snapshot model credited the same
  // 200 g to both and under-bought.
  const two = projectLines(
    [
      planDemand({ name: "Flour", amount: 500, unit: "g" }),
      {
        ...planDemand({ name: "Flour", amount: 500, unit: "g" }),
        source: {
          kind: "plan",
          id: "entry-2",
          label: "Waffles",
          slug: "waffles",
        },
      },
    ],
    stock,
    [],
  );
  assertEquals(two.length, 1);
  assertEquals(two[0].required, 1000);
  assertEquals(two[0].needed, 800);
  assertEquals(two[0].sources.length, 2);
});

Deno.test("projectLines: scale is applied to plan demand", () => {
  const lines = projectLines(
    [planDemand({ name: "Flour", amount: 250, unit: "g", scale: 3 })],
    [],
    [],
  );
  assertEquals(lines[0].required, 750);
  assertEquals(lines[0].needed, 750);
});

Deno.test("projectLines: demands in different units merge into one line", () => {
  const lines = projectLines(
    [
      planDemand({
        ingredient_id: FLOUR,
        name: "Flour",
        amount: 1,
        unit: "kg",
      }),
      {
        ...planDemand({
          ingredient_id: FLOUR,
          name: "Flour",
          amount: 200,
          unit: "g",
        }),
        source: { kind: "plan", id: "entry-2", label: "Bread", slug: "bread" },
      },
    ],
    [],
    [],
  );
  assertEquals(lines.length, 1);
  // Reported in the unit of the bigger requirement.
  assertEquals(lines[0].unit, "kg");
  assertEquals(lines[0].needed, 1.2);
});

Deno.test("projectLines: manual and plan demand for one ingredient combine", () => {
  const lines = projectLines(
    [
      planDemand({
        ingredient_id: FLOUR,
        name: "Flour",
        amount: 300,
        unit: "g",
      }),
      {
        source: { kind: "manual", id: "d1", label: "Added by hand" },
        ingredient_id: FLOUR,
        name: "Flour",
        amount: 700,
        unit: "g",
      },
    ],
    [],
    [],
  );
  assertEquals(lines.length, 1);
  assertEquals(lines[0].needed, 1000);
  assertEquals(lines[0].sources.map((s) => s.kind), ["plan", "manual"]);
});

Deno.test("projectLines: a purchase keeps the line, marked bought", () => {
  const purchase: Purchase = {
    id: "p1",
    match_key: "name:flour",
    ingredient_id: null,
    name: "Flour",
    amount: 1,
    unit: "kg",
    store_id: "store-1",
    price: null,
    expires_at: null,
  };
  // Stock now covers the demand because the purchase was added to the pantry,
  // but the line must stay visible as a ticked-off row.
  const lines = projectLines(
    [planDemand({ name: "Flour", amount: 500, unit: "g" })],
    [{ name: "Flour", amount: 1000, unit: "g" }],
    [purchase],
  );
  assertEquals(lines.length, 1);
  assertEquals(lines[0].purchase?.id, "p1");
  assertEquals(lines[0].needed, 0);
  assertEquals(lines[0].store_id, "store-1");
});

Deno.test("projectLines: staples never generate a line", () => {
  const lines = projectLines(
    [planDemand({ name: "Salt", amount: 10, unit: "g" })],
    [{ name: "Salt", staple: true }],
    [],
  );
  assertEquals(lines, []);
});

Deno.test("projectLines: untracked stock keeps the line but flags it", () => {
  const lines = projectLines(
    [planDemand({ name: "Pepper", amount: 5, unit: "g" })],
    [{ name: "Pepper" }],
    [],
  );
  assertEquals(lines.length, 1);
  assert(lines[0].quantityUnknown);
});

Deno.test("projectLines: store preference beats the cheapest store", () => {
  const lines = projectLines(
    [planDemand({
      ingredient_id: FLOUR,
      name: "Flour",
      amount: 1,
      unit: "kg",
    })],
    [],
    [],
    {
      storePreferences: new Map([[FLOUR, "preferred"]]),
      fallbackStores: new Map([[FLOUR, "cheapest"]]),
    },
  );
  assertEquals(lines[0].store_id, "preferred");

  const withoutPreference = projectLines(
    [planDemand({
      ingredient_id: FLOUR,
      name: "Flour",
      amount: 1,
      unit: "kg",
    })],
    [],
    [],
    { fallbackStores: new Map([[FLOUR, "cheapest"]]) },
  );
  assertEquals(withoutPreference[0].store_id, "cheapest");
});

Deno.test("projectLines: bought lines sort last", () => {
  const lines = projectLines(
    [
      planDemand({ name: "Apples", amount: 4, unit: "pcs" }),
      {
        ...planDemand({ name: "Zucchini", amount: 2, unit: "pcs" }),
        source: { kind: "manual", id: "d2", label: "" },
      },
    ],
    [],
    [{
      id: "p1",
      match_key: "name:apples",
      ingredient_id: null,
      name: "Apples",
      amount: 4,
      unit: "pcs",
      store_id: null,
      price: null,
      expires_at: null,
    }],
  );
  assertEquals(lines.map((l) => l.name), ["Zucchini", "Apples"]);
});
