import { toBaseUnit } from "./unit-convert.ts";
import { getUnitStep, VOLUME_UNITS, WEIGHT_UNITS } from "./units.ts";

export type QuantityType = "servings" | "weight" | "volume" | "dimensions";

export interface RecipeQuantity {
  type: QuantityType;
  value: number; // servings count, grams, ml, or width (cm)
  unit: string;
  value2?: number; // length for dimensions
  value3?: number; // depth for dimensions
  unit2?: string; // always "cm" for dimensions
}

export const QUANTITY_TYPES: { type: QuantityType; label: string }[] = [
  { type: "servings", label: "Servings" },
  { type: "weight", label: "Weight" },
  { type: "volume", label: "Volume" },
  { type: "dimensions", label: "Tray dimensions" },
];

/**
 * Units a recipe's scaling quantity can be stated in. Weight and volume come
 * from the shared ingredient unit list so the yield dropdown and ingredient
 * lines never disagree, and every entry has a conversion factor in
 * unit-convert.ts so scaling between them stays exact.
 */
export const QUANTITY_UNITS: Record<QuantityType, string[]> = {
  servings: ["servings", "portions", "pieces"],
  weight: WEIGHT_UNITS,
  volume: VOLUME_UNITS,
  dimensions: ["cm"],
};

/** HTML step attribute for a quantity unit's amount input. */
export function quantityStep(type: QuantityType, unit: string): string {
  if (type === "servings") return "1";
  if (type === "dimensions") return "0.5";
  return getUnitStep(unit);
}

export const QUANTITY_DEFAULTS: Record<
  QuantityType,
  { value: number; unit: string; value2?: number; value3?: number }
> = {
  servings: { value: 4, unit: "servings" },
  weight: { value: 500, unit: "g" },
  volume: { value: 500, unit: "ml" },
  dimensions: { value: 30, unit: "cm", value2: 40, value3: 5 },
};

export function computeScaleRatio(
  base: RecipeQuantity,
  target: RecipeQuantity,
): number {
  if (base.type === "dimensions" && target.type === "dimensions") {
    const baseVol = base.value * (base.value2 ?? base.value) *
      (base.value3 ?? 1);
    const targetVol = target.value * (target.value2 ?? target.value) *
      (target.value3 ?? 1);
    return baseVol > 0 ? targetVol / baseVol : 1;
  }

  const baseNormalized = normalizeValue(base.value, base.unit);
  const targetNormalized = normalizeValue(target.value, target.unit);
  return baseNormalized > 0 ? targetNormalized / baseNormalized : 1;
}

/** Express a quantity in its base unit (g, ml, mm) so units can be compared. */
function normalizeValue(value: number, unit: string): number {
  return toBaseUnit(value, unit).amount;
}

export function formatQuantity(q: RecipeQuantity): string {
  const fmt = (n: number) => {
    const v = Number(n);
    return v % 1 === 0 ? v.toFixed(0) : String(v);
  };
  if (q.type === "dimensions") {
    const parts = [q.value, q.value2 ?? q.value];
    if (q.value3) parts.push(q.value3);
    return parts.map(fmt).join(" x ") + " cm";
  }
  return `${fmt(q.value)} ${q.unit}`;
}
