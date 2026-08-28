import { handler } from "./$recipes.ts";
import { logAudit } from "../../../lib/audit.ts";
import { recipeIsVisible } from "../../../lib/recipe-visibility.ts";
import {
  CollectionRecipesBody,
  parseJsonBody,
} from "../../../lib/validation.ts";

export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const result = await parseJsonBody(ctx.req, CollectionRecipesBody);
    if (!result.success) return result.response;
    const { action, collection_id, recipe_id } = result.data;
    const householdId = ctx.state.householdId;

    // Verify the user's household owns this collection
    const collRes = await ctx.state.db.query<{ name: string }>(
      "SELECT name FROM collections WHERE id = $1 AND household_id = $2",
      [collection_id, householdId],
    );
    if (collRes.rows.length === 0) {
      return new Response(null, { status: 403 });
    }
    const collectionName = collRes.rows[0].name;

    const visible = await recipeIsVisible(
      ctx.state.db,
      recipe_id,
      householdId,
    );
    if (action === "add" && !visible) {
      return Response.json({ error: "Recipe not found" }, { status: 404 });
    }

    const recipeRes = visible
      ? await ctx.state.db.query<{ title: string }>(
        "SELECT title FROM recipes WHERE id = $1",
        [recipe_id],
      )
      : { rows: [] as { title: string }[] };
    const recipeTitle = recipeRes.rows[0]?.title;

    if (action === "add") {
      const maxRes = await ctx.state.db.query<{ max_order: number }>(
        "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM collection_recipes WHERE collection_id = $1",
        [collection_id],
      );
      const sortOrder = maxRes.rows[0].max_order + 1;
      await ctx.state.db.query(
        `INSERT INTO collection_recipes (collection_id, recipe_id, sort_order)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [collection_id, recipe_id, sortOrder],
      );
      await ctx.state.db.query(
        "UPDATE collections SET updated_at = now() WHERE id = $1",
        [collection_id],
      );
    } else {
      await ctx.state.db.query(
        "DELETE FROM collection_recipes WHERE collection_id = $1 AND recipe_id = $2",
        [collection_id, recipe_id],
      );
      await ctx.state.db.query(
        "UPDATE collections SET updated_at = now() WHERE id = $1",
        [collection_id],
      );
    }

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: action === "add"
        ? "collection.add_recipe"
        : "collection.remove_recipe",
      targetType: "collection",
      targetId: collection_id,
      targetLabel: collectionName,
      detail: recipeTitle
        ? `${action === "add" ? "added" : "removed"} ${recipeTitle}`
        : `${
          action === "add" ? "added" : "removed"
        } unknown recipe ${recipe_id}`,
      householdId: ctx.state.householdId,
    });

    return Response.json({ ok: true });
  },
});
