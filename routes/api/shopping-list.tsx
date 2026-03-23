import { define } from "../../utils.ts";
import type { QueryFn } from "../../db/mod.ts";
import type {
  PantryItem,
  ShoppingList,
  ShoppingListItem,
} from "../../db/types.ts";
import { convertAmount } from "../../lib/unit-convert.ts";
import { parseJsonBody, ShoppingListAction } from "../../lib/validation.ts";

async function getOrCreateList(
  db: { query: QueryFn },
  householdId: string,
): Promise<string> {
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

    const result = await parseJsonBody(ctx.req, ShoppingListAction);
    if (!result.success) return result.response;
    const body = result.data;
    const listId = await getOrCreateList(ctx.state.db, ctx.state.householdId);

    if (body.action === "add_recipe") {
      const { recipe_id, items } = body;

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

      return new Response(
        JSON.stringify({
          ok: true,
          list_id: listId,
          item_id: insertRes.rows[0].id,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
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
          const itemRes = await ctx.state.db.query<
            Pick<ShoppingListItem, "ingredient_id" | "name" | "amount" | "unit">
          >(
            "SELECT ingredient_id, name, amount, unit FROM shopping_list_items WHERE id = $1",
            [item_id],
          );
          if (itemRes.rows.length > 0) {
            const item = itemRes.rows[0];
            // Find existing pantry entry and add amount (converting units if needed)
            let existing;
            if (item.ingredient_id) {
              existing = await ctx.state.db.query<
                Pick<PantryItem, "id" | "amount" | "unit"> & {
                  density: number | null;
                }
              >(
                `SELECT pi.id, pi.amount, pi.unit, g.density
                 FROM pantry_items pi
                 LEFT JOIN ingredients g ON g.id = pi.ingredient_id
                 WHERE pi.household_id = $1 AND pi.ingredient_id = $2`,
                [ctx.state.householdId, item.ingredient_id],
              );
            } else {
              existing = await ctx.state.db.query<
                Pick<PantryItem, "id" | "amount" | "unit"> & {
                  density: number | null;
                }
              >(
                `SELECT pi.id, pi.amount, pi.unit, null as density
                 FROM pantry_items pi
                 WHERE pi.household_id = $1 AND lower(pi.name) = lower($2)`,
                [ctx.state.householdId, item.name],
              );
            }
            if (existing.rows.length > 0) {
              const row = existing.rows[0];
              let addAmount = item.amount;
              if (addAmount != null && (item.unit || "") !== (row.unit || "")) {
                const converted = convertAmount(
                  addAmount,
                  item.unit || "",
                  row.unit || "",
                  row.density,
                );
                addAmount = converted;
              }
              const newAmount = addAmount != null
                ? (row.amount || 0) + addAmount
                : row.amount;
              await ctx.state.db.query(
                "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
                [newAmount, row.id],
              );
            } else {
              await ctx.state.db.query(
                `INSERT INTO pantry_items (household_id, ingredient_id, name, amount, unit)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                  ctx.state.householdId,
                  item.ingredient_id ?? null,
                  item.name,
                  item.amount,
                  item.unit,
                ],
              );
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

    if (body.action === "generate_share_link") {
      const token = crypto.randomUUID();
      await ctx.state.db.query(
        "UPDATE shopping_lists SET share_token = $1, share_token_expires_at = now() + interval '30 days' WHERE id = $2",
        [token, listId],
      );
      return new Response(
        JSON.stringify({ ok: true, share_token: token }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.action === "revoke_share_link") {
      await ctx.state.db.query(
        "UPDATE shopping_lists SET share_token = NULL, share_token_expires_at = NULL WHERE id = $1",
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
