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

export function computeIngredientCost(
  ingredientAmount: number,
  ingredientUnit: string,
  price: number,
  priceAmount: number,
  priceUnit: string,
): number | null {
  const ing = toBaseUnit(ingredientAmount, ingredientUnit);
  const pr = toBaseUnit(priceAmount, priceUnit);

  if (ing.unit !== pr.unit) return null;
  if (pr.amount === 0) return null;

  return (ing.amount / pr.amount) * price;
}
