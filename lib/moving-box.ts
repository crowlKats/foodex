/**
 * The moving box: what a member takes with them when leaving a household.
 *
 * Packing snapshots a recipe into the agent's data representation (the same
 * shape staged changes use) and copies its images to box-scoped S3 objects,
 * so nothing in the box depends on the source household still existing or
 * the user still being a member. Unpacking materializes the snapshots into
 * the user's next household through `createRecipeFromData`, recreating any
 * collections the packed recipes were grouped under.
 */
import type { QueryFn } from "../db/mod.ts";
import type { User } from "../utils.ts";
import { type AgentRecipe, createRecipeFromData } from "./agent/recipe.ts";
import { loadAgentRecipe } from "./agent/recipe.ts";
import { copyFile, getServeUrl } from "./s3.ts";
import { logAudit } from "./audit.ts";

interface BoxedMedia {
  media_id: string;
  key: string;
  content_type: string;
  filename: string | null;
  size_bytes: number | null;
}

export interface BoxRow {
  id: string;
  source_recipe_id: string | null;
  title: string;
  data: AgentRecipe;
  media: BoxedMedia[];
  collection_names: string[];
  created_at: Date;
}

/** Media ids a snapshot references: the cover plus every step image. */
function referencedMediaIds(r: AgentRecipe): string[] {
  const ids = new Set<string>();
  if (r.cover_image_id) ids.add(r.cover_image_id);
  for (const s of r.steps ?? []) {
    for (const m of s.media ?? []) ids.add(m);
  }
  return [...ids];
}

/**
 * Pack one recipe. Repacking the same recipe only merges collection names,
 * so packing a collection after packing one of its recipes individually
 * doesn't duplicate anything. Image copies are best effort: an entry that
 * fails to copy is left out and the recipe unpacks without that image.
 */
export async function packRecipe(
  q: QueryFn,
  userId: string,
  recipeId: string,
  collectionNames: string[],
): Promise<boolean> {
  const existing = await q<{ id: string }>(
    `UPDATE moving_box_recipes
     SET collection_names = (
       SELECT ARRAY(
         SELECT DISTINCT x
         FROM unnest(collection_names || $3::text[]) AS x
       )
     )
     WHERE user_id = $1 AND source_recipe_id = $2
     RETURNING id`,
    [userId, recipeId, collectionNames],
  );
  if (existing.rows.length > 0) return false;

  const loaded = await loadAgentRecipe(q, recipeId);
  if (!loaded) return false;
  const recipe = loaded.recipe;

  const boxId = crypto.randomUUID();
  const mediaIds = referencedMediaIds(recipe);
  const manifest: BoxedMedia[] = [];
  if (mediaIds.length > 0) {
    const mediaRes = await q<{
      id: string;
      key: string;
      content_type: string;
      filename: string | null;
      size_bytes: number | null;
    }>(
      `SELECT id, key, content_type, filename, size_bytes
       FROM media WHERE id = ANY($1)`,
      [mediaIds],
    );
    for (const [i, m] of mediaRes.rows.entries()) {
      const destKey = `moving-box/${boxId}/${i}`;
      try {
        await copyFile(m.key, destKey);
        manifest.push({
          media_id: m.id,
          key: destKey,
          content_type: m.content_type,
          filename: m.filename,
          size_bytes: m.size_bytes,
        });
      } catch (err) {
        console.error(`moving box: image copy failed for ${m.key}:`, err);
      }
    }
  }

  await q(
    `INSERT INTO moving_box_recipes
       (id, user_id, source_recipe_id, title, data, media, collection_names)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      boxId,
      userId,
      recipeId,
      recipe.title,
      JSON.stringify(recipe),
      JSON.stringify(manifest),
      collectionNames,
    ],
  );
  return true;
}

/**
 * Materialize the user's box into a household. Each row is independent: a
 * snapshot that fails to unpack stays in the box instead of sinking the
 * rest (or the join that triggered this).
 */
export async function unpackMovingBox(
  q: QueryFn,
  actor: User,
  householdId: string,
): Promise<{ recipes: number; collections: number }> {
  const box = await q<BoxRow>(
    `SELECT id, source_recipe_id, title, data, media, collection_names,
            created_at
     FROM moving_box_recipes WHERE user_id = $1 ORDER BY created_at`,
    [actor.id],
  );
  if (box.rows.length === 0) return { recipes: 0, collections: 0 };

  const byCollection = new Map<string, string[]>();
  let unpacked = 0;

  for (const row of box.rows) {
    try {
      const recipe = row.data;

      // Recreate the images as this household's media, then point the
      // snapshot at the new rows before materializing.
      const idMap = new Map<string, string>();
      for (const m of row.media) {
        const created = await q<{ id: string }>(
          `INSERT INTO media
             (household_id, key, url, content_type, filename, size_bytes)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            householdId,
            m.key,
            getServeUrl(m.key),
            m.content_type,
            m.filename,
            m.size_bytes,
          ],
        );
        idMap.set(m.media_id, created.rows[0].id);
      }
      recipe.cover_image_id = recipe.cover_image_id
        ? idMap.get(recipe.cover_image_id) ?? null
        : null;
      for (const s of recipe.steps ?? []) {
        if (s.media) {
          s.media = s.media
            .map((id) => idMap.get(id))
            .filter((id): id is string => id != null);
        }
      }

      const { recipe_id, slug } = await createRecipeFromData(
        q,
        householdId,
        recipe,
      );
      for (const name of row.collection_names) {
        const ids = byCollection.get(name) ?? [];
        ids.push(recipe_id);
        byCollection.set(name, ids);
      }
      await q("DELETE FROM moving_box_recipes WHERE id = $1", [row.id]);
      unpacked++;

      await logAudit(q, actor, {
        action: "recipe.create",
        targetType: "recipe",
        targetId: recipe_id,
        targetLabel: recipe.title,
        detail: `unpacked from moving box, slug: ${slug}`,
        householdId,
      });
    } catch (err) {
      console.error(`moving box: failed to unpack "${row.title}":`, err);
    }
  }

  let collections = 0;
  for (const [name, recipeIds] of byCollection) {
    const col = await q<{ id: string }>(
      "INSERT INTO collections (household_id, name) VALUES ($1, $2) RETURNING id",
      [householdId, name],
    );
    for (const rid of recipeIds) {
      await q(
        `INSERT INTO collection_recipes (collection_id, recipe_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [col.rows[0].id, rid],
      );
    }
    collections++;
    await logAudit(q, actor, {
      action: "collection.create",
      targetType: "collection",
      targetId: col.rows[0].id,
      targetLabel: name,
      detail: "unpacked from moving box",
      householdId,
    });
  }

  return { recipes: unpacked, collections };
}
