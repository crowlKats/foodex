import { define } from "../../utils.ts";

async function getOrCreateList(
  db: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  userId: number,
): Promise<number> {
  const res = await db.query(
    "SELECT id FROM shopping_lists WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  if (res.rows.length > 0) return res.rows[0].id as number;
  const create = await db.query(
    "INSERT INTO shopping_lists (user_id) VALUES ($1) RETURNING id",
    [userId],
  );
  return create.rows[0].id as number;
}

export const handler = define.handlers({
  // Add items to shopping list
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, { status: 401 });
    }

    const body = await ctx.req.json();
    const listId = await getOrCreateList(ctx.state.db, ctx.state.user.id);

    if (body.action === "add_recipe") {
      // Add all ingredients from a recipe
      const { recipe_id, scale } = body as {
        recipe_id: number;
        scale: number;
        action: string;
      };
      const ratio = scale || 1;

      const ingredientsRes = await ctx.state.db.query(
        `SELECT ri.ingredient_id, ri.name, ri.amount, ri.unit
         FROM recipe_ingredients ri
         WHERE ri.recipe_id = $1
         ORDER BY ri.sort_order`,
        [recipe_id],
      );

      // Get max sort_order
      const maxRes = await ctx.state.db.query(
        "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM shopping_list_items WHERE shopping_list_id = $1",
        [listId],
      );
      let sortOrder = (maxRes.rows[0].max_order as number) + 1;

      for (const ing of ingredientsRes.rows) {
        const amount = ing.amount != null ? Number(ing.amount) * ratio : null;
        await ctx.state.db.query(
          `INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, name, amount, unit, recipe_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            listId,
            ing.ingredient_id ?? null,
            String(ing.name),
            amount,
            ing.unit ?? null,
            recipe_id,
            sortOrder++,
          ],
        );
      }

      return new Response(JSON.stringify({ ok: true, list_id: listId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "add_ingredient") {
      const { ingredient_id, name, amount, unit, recipe_id } = body;

      const maxRes = await ctx.state.db.query(
        "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM shopping_list_items WHERE shopping_list_id = $1",
        [listId],
      );
      const sortOrder = (maxRes.rows[0].max_order as number) + 1;

      await ctx.state.db.query(
        `INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, name, amount, unit, recipe_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          listId,
          ingredient_id ?? null,
          name,
          amount ?? null,
          unit ?? null,
          recipe_id ?? null,
          sortOrder,
        ],
      );

      return new Response(JSON.stringify({ ok: true, list_id: listId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "update_item") {
      const { item_id, store_id, checked } = body;
      if (store_id !== undefined) {
        await ctx.state.db.query(
          "UPDATE shopping_list_items SET store_id = $1 WHERE id = $2 AND shopping_list_id = $3",
          [store_id || null, item_id, listId],
        );
      }
      if (checked !== undefined) {
        await ctx.state.db.query(
          "UPDATE shopping_list_items SET checked = $1 WHERE id = $2 AND shopping_list_id = $3",
          [checked, item_id, listId],
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "remove_item") {
      await ctx.state.db.query(
        "DELETE FROM shopping_list_items WHERE id = $1 AND shopping_list_id = $2",
        [body.item_id, listId],
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "clear_checked") {
      await ctx.state.db.query(
        "DELETE FROM shopping_list_items WHERE shopping_list_id = $1 AND checked = true",
        [listId],
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "clear_all") {
      await ctx.state.db.query(
        "DELETE FROM shopping_list_items WHERE shopping_list_id = $1",
        [listId],
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  },
});
