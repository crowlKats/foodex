import type { QueryFn } from "../db/mod.ts";

/**
 * Whether the caller may fetch this media key. Keys are UUID path segments,
 * not a substitute for authorization: a row must exist, and it must be the
 * caller's household's upload or attached to a recipe/collection they may see.
 */
export async function mediaIsReadable(
  db: { query: QueryFn },
  key: string,
  householdId: string | null,
): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM media m
     WHERE m.key = $1
       AND (
         ($2::uuid IS NOT NULL AND m.household_id = $2)
         OR EXISTS (
           SELECT 1 FROM recipes r
           WHERE r.cover_image_id = m.id
             AND (r.private = false OR r.household_id = $2)
         )
         OR EXISTS (
           SELECT 1 FROM recipe_step_media rsm
           JOIN recipe_steps rs ON rs.id = rsm.step_id
           JOIN recipes r ON r.id = rs.recipe_id
           WHERE rsm.media_id = m.id
             AND (r.private = false OR r.household_id = $2)
         )
         OR EXISTS (
           SELECT 1 FROM collections c
           WHERE c.cover_image_id = m.id
             AND (
               c.private = false
               OR ($2::uuid IS NOT NULL AND c.household_id = $2)
               OR ($2::uuid IS NOT NULL AND EXISTS (
                 SELECT 1 FROM collection_shares cs
                 WHERE cs.collection_id = c.id AND cs.household_id = $2
               ))
             )
         )
       )`,
    [key, householdId],
  );
  return res.rows.length > 0;
}
