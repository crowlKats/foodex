const CONVERSIONS: Record<string, { base: string; factor: number }> = {
  // Weight → grams
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  mg: { base: "g", factor: 0.001 },
  oz: { base: "g", factor: 28.3495 },
  lb: { base: "g", factor: 453.592 },
  // Volume → ml
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
  cl: { base: "ml", factor: 10 },
  dl: { base: "ml", factor: 100 },
  "fl oz": { base: "ml", factor: 29.5735 },
  cup: { base: "ml", factor: 236.588 },
  tbsp: { base: "ml", factor: 14.787 },
  tsp: { base: "ml", factor: 4.929 },
  // Length → mm
  mm: { base: "mm", factor: 1 },
  cm: { base: "mm", factor: 10 },
  inch: { base: "mm", factor: 25.4 },
};

export function toBaseUnit(
  amount: number,
  unit: string,
): { amount: number; unit: string } {
  const conv = CONVERSIONS[unit];
  if (!conv) return { amount, unit };
  return { amount: amount * conv.factor, unit: conv.base };
}

/**
 * Convert both values to matching base units, using density (g/ml) to bridge
 * mass↔volume when the base units differ.
 */
function toComparableUnits(
  a: { amount: number; unit: string },
  b: { amount: number; unit: string },
  density?: number | null,
): { a: number; b: number } | null {
  if (a.unit === b.unit) return { a: a.amount, b: b.amount };

  if (!density || density <= 0) return null;

  // Convert both to grams for comparison
  if (a.unit === "g" && b.unit === "ml") {
    return { a: a.amount, b: b.amount * density };
  }
  if (a.unit === "ml" && b.unit === "g") {
    return { a: a.amount * density, b: b.amount };
  }

  return null;
}

/**
 * Convert an amount from one unit to another, using density (g/ml) to bridge
 * mass↔volume when needed. Returns null if conversion is not possible.
 */
export function convertAmount(
  amount: number,
  fromUnit: string,
  toUnit: string,
  density?: number | null,
): number | null {
  if (fromUnit === toUnit) return amount;
  const from = toBaseUnit(amount, fromUnit);
  const to = toBaseUnit(1, toUnit);
  const comparable = toComparableUnits(from, {
    amount: to.amount,
    unit: to.unit,
  }, density);
  if (!comparable) return null;
  if (comparable.b === 0) return null;
  return comparable.a / comparable.b;
}

export function computeIngredientCost(
  ingredientAmount: number,
  ingredientUnit: string,
  price: number,
  priceAmount: number,
  priceUnit: string,
  density?: number | null,
): number | null {
  const ing = toBaseUnit(ingredientAmount, ingredientUnit);
  const pr = toBaseUnit(priceAmount, priceUnit);

  const comparable = toComparableUnits(ing, pr, density);
  if (!comparable) return null;
  if (comparable.b === 0) return null;

  return (comparable.a / comparable.b) * price;
}
