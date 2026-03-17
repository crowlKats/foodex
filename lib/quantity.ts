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

export const QUANTITY_UNITS: Record<QuantityType, string[]> = {
  servings: ["servings", "portions", "pieces"],
  weight: ["g", "kg"],
  volume: ["ml", "l"],
  dimensions: ["cm"],
};

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

function normalizeValue(value: number, unit: string): number {
  switch (unit) {
    case "kg":
      return value * 1000;
    case "l":
      return value * 1000;
    default:
      return value;
  }
}

export function formatQuantity(q: RecipeQuantity): string {
  if (q.type === "dimensions") {
    const parts = [q.value, q.value2 ?? q.value];
    if (q.value3) parts.push(q.value3);
    return parts.join(" x ") + " cm";
  }
  return `${q.value} ${q.unit}`;
}
