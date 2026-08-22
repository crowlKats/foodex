import type { QueryFn } from "../db/mod.ts";

/**
 * Whether this household may see the recipe: public, or private to them.
 * Same predicate pinPlanEntry, recipe GET, and @recipe() resolution use.
 */
export async function recipeIsVisible(
  db: { query: QueryFn },
  recipeId: string,
  householdId: string | null,
): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM recipes
     WHERE id = $1 AND (private = false OR household_id = $2)`,
    [recipeId, householdId],
  );
  return res.rows.length > 0;
}
