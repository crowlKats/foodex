import { assertAlmostEquals, assertEquals } from "@std/assert";
import {
  computeScaleRatio,
  QUANTITY_TYPES,
  QUANTITY_UNITS,
  quantityStep,
} from "./quantity.ts";
import { UNIT_GROUPS } from "./units.ts";
import { toBaseUnit } from "./unit-convert.ts";

Deno.test("yield units mirror the shared weight and volume unit lists", () => {
  const weight = UNIT_GROUPS.find((g) => g.label === "Weight")!.units.map((u) =>
    u.name
  );
  const volume = UNIT_GROUPS.find((g) => g.label === "Volume")!.units.map((u) =>
    u.name
  );
  assertEquals(QUANTITY_UNITS.weight, weight);
  assertEquals(QUANTITY_UNITS.volume, volume);
  assertEquals(QUANTITY_UNITS.volume.includes("tbsp"), true);
});

Deno.test("every weight and volume yield unit has a conversion factor", () => {
  for (const type of ["weight", "volume"] as const) {
    for (const unit of QUANTITY_UNITS[type]) {
      const base = toBaseUnit(1, unit);
      assertEquals(base.unit, type === "weight" ? "g" : "ml", unit);
    }
  }
  for (const qt of QUANTITY_TYPES) {
    assertEquals(QUANTITY_UNITS[qt.type].length > 0, true, qt.type);
  }
});

Deno.test("scale ratio converts across units of the same kind", () => {
  // 7 tbsp base, scaled to 14 tbsp doubles.
  assertAlmostEquals(
    computeScaleRatio(
      { type: "volume", value: 7, unit: "tbsp" },
      { type: "volume", value: 14, unit: "tbsp" },
    ),
    2,
  );
  // 7 tbsp base, target 1 cup: 236.588 / (7 * 14.787).
  assertAlmostEquals(
    computeScaleRatio(
      { type: "volume", value: 7, unit: "tbsp" },
      { type: "volume", value: 1, unit: "cup" },
    ),
    236.588 / (7 * 14.787),
    1e-9,
  );
  assertAlmostEquals(
    computeScaleRatio(
      { type: "weight", value: 1, unit: "lb" },
      { type: "weight", value: 8, unit: "oz" },
    ),
    0.5,
    1e-3,
  );
  // The old kg/l behaviour is preserved.
  assertAlmostEquals(
    computeScaleRatio(
      { type: "weight", value: 500, unit: "g" },
      { type: "weight", value: 1, unit: "kg" },
    ),
    2,
  );
  assertAlmostEquals(
    computeScaleRatio(
      { type: "servings", value: 4, unit: "servings" },
      { type: "servings", value: 6, unit: "servings" },
    ),
    1.5,
  );
});

Deno.test("amount step follows the unit", () => {
  assertEquals(quantityStep("servings", "servings"), "1");
  assertEquals(quantityStep("volume", "tbsp"), "0.5");
  assertEquals(quantityStep("volume", "ml"), "1");
  assertEquals(quantityStep("weight", "kg"), "0.01");
  assertEquals(quantityStep("dimensions", "cm"), "0.5");
});
