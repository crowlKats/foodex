import { define } from "../../../utils.ts";
import {
  CollectionRecipesBody,
  parseJsonBody,
} from "../../../lib/validation.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const result = await parseJsonBody(ctx.req, CollectionRecipesBody);
    if (!result.success) return result.response;
    const { action, collection_id, recipe_id } = result.data;

    // Verify the user's household owns this collection
    const collRes = await ctx.state.db.query(
      "SELECT 1 FROM collections WHERE id = $1 AND household_id = $2",
      [collection_id, ctx.state.householdId],
    );
    if (collRes.rows.length === 0) {
      return new Response(null, { status: 403 });
    }

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

    return Response.json({ ok: true });
  },
});
