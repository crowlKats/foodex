/**
 * Resolve an ingredient_id for an ingredient: only link if explicitly selected.
 */
export function resolveIngredientId(
  ingredientId: string | undefined,
): number | null {
  if (ingredientId) return parseInt(ingredientId);
  return null;
}

// Parse indexed form field arrays from FormData.
// E.g., "ingredients[0][name]", "ingredients[1][amount]" -> [{name: ..., amount: ...}]
export function parseFormArray(
  formData: FormData,
  prefix: string,
): Record<string, string>[] {
  const items: Map<number, Record<string, string>> = new Map();

  for (const [key, value] of formData.entries()) {
    const match = key.match(
      new RegExp(`^${prefix}\\[(\\d+)\\]\\[([a-zA-Z_]+)\\]$`),
    );
    if (match) {
      const index = parseInt(match[1]);
      const field = match[2];
      if (!items.has(index)) items.set(index, {});
      items.get(index)![field] = value as string;
    }
  }

  return [...items.entries()]
    .sort(([a], [b]) => a - b)
    .map(([_, v]) => v);
}
