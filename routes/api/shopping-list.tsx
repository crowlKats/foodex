import { define } from "../../utils.ts";
import type { QueryFn } from "../../db/mod.ts";
import type { ShoppingList, ShoppingListItem, PantryItem } from "../../db/types.ts";

async function getOrCreateList(
  db: { query: QueryFn },
  householdId: number,
): Promise<number> {
  const res = await db.query<Pick<ShoppingList, "id">>(
    "SELECT id FROM shopping_lists WHERE household_id = $1 ORDER BY created_at DESC LIMIT 1",
    [householdId],
  );
  if (res.rows.length > 0) return res.rows[0].id;
  const create = await db.query<Pick<ShoppingList, "id">>(
    "INSERT INTO shopping_lists (household_id) VALUES ($1) RETURNING id",
    [householdId],
  );
  return create.rows[0].id;
}

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const body = await ctx.req.json();
    const listId = await getOrCreateList(ctx.state.db, ctx.state.householdId);

    if (body.action === "add_recipe") {
      const { recipe_id, items } = body as {
        recipe_id: number;
        items: { ingredient_id: number | null; name: string; amount: number | null; unit: string | null }[];
        action: string;
      };

      const maxRes = await ctx.state.db.query<{ max_order: number }>(
        "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM shopping_list_items WHERE shopping_list_id = $1",
        [listId],
      );
      let sortOrder = maxRes.rows[0].max_order + 1;

      for (const item of items) {
        await ctx.state.db.query(
          `INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, name, amount, unit, recipe_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            listId,
            item.ingredient_id ?? null,
            item.name,
            item.amount,
            item.unit ?? null,
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

      const maxRes = await ctx.state.db.query<{ max_order: number }>(
        "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM shopping_list_items WHERE shopping_list_id = $1",
        [listId],
      );
      const sortOrder = maxRes.rows[0].max_order + 1;

      const insertRes = await ctx.state.db.query<Pick<ShoppingListItem, "id">>(
        `INSERT INTO shopping_list_items (shopping_list_id, ingredient_id, name, amount, unit, recipe_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
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

      return new Response(JSON.stringify({ ok: true, list_id: listId, item_id: insertRes.rows[0].id }), {
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

        // When checking off (buying), add to pantry
        if (checked && ctx.state.householdId) {
          const itemRes = await ctx.state.db.query<Pick<ShoppingListItem, "ingredient_id" | "name" | "amount" | "unit">>(
            "SELECT ingredient_id, name, amount, unit FROM shopping_list_items WHERE id = $1",
            [item_id],
          );
          if (itemRes.rows.length > 0) {
            const item = itemRes.rows[0];
            // If ingredient already in pantry with same unit, add amount
            if (item.ingredient_id) {
              const existing = await ctx.state.db.query<Pick<PantryItem, "id" | "amount">>(
                `SELECT id, amount FROM pantry_items
                 WHERE household_id = $1 AND ingredient_id = $2 AND COALESCE(unit, '') = COALESCE($3, '')`,
                [ctx.state.householdId, item.ingredient_id, item.unit],
              );
              if (existing.rows.length > 0) {
                const newAmount = item.amount != null
                  ? (existing.rows[0].amount || 0) + item.amount
                  : existing.rows[0].amount;
                await ctx.state.db.query(
                  "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
                  [newAmount, existing.rows[0].id],
                );
              } else {
                await ctx.state.db.query(
                  `INSERT INTO pantry_items (household_id, ingredient_id, name, amount, unit)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [ctx.state.householdId, item.ingredient_id, item.name, item.amount, item.unit],
                );
              }
            } else {
              // No ingredient_id, match by name
              const existing = await ctx.state.db.query<Pick<PantryItem, "id" | "amount">>(
                `SELECT id, amount FROM pantry_items
                 WHERE household_id = $1 AND lower(name) = lower($2) AND COALESCE(unit, '') = COALESCE($3, '')`,
                [ctx.state.householdId, item.name, item.unit],
              );
              if (existing.rows.length > 0) {
                const newAmount = item.amount != null
                  ? (existing.rows[0].amount || 0) + item.amount
                  : existing.rows[0].amount;
                await ctx.state.db.query(
                  "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
                  [newAmount, existing.rows[0].id],
                );
              } else {
                await ctx.state.db.query(
                  `INSERT INTO pantry_items (household_id, ingredient_id, name, amount, unit)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [ctx.state.householdId, null, item.name, item.amount, item.unit],
                );
              }
            }
          }
        }
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
