import { handler } from "./$shopping-list.ts";
import { ensureIngredientIds } from "../../lib/ingredient-resolve.ts";
import {
  buyLine,
  getOrCreateList,
  projectShoppingList,
  unbuyLine,
} from "../../lib/shopping-list.ts";
import { parseJsonBody, ShoppingListAction } from "../../lib/validation.ts";

export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const result = await parseJsonBody(ctx.req, ShoppingListAction);
    if (!result.success) return result.response;
    const body = result.data;
    const householdId = ctx.state.householdId;
    const userId = ctx.state.user.id;

    return await ctx.state.db.transaction(async (query) => {
      const db = { query };
      const list = await getOrCreateList(db, householdId);
      const listId = list.id;

      /**
       * Every mutation answers with the recomputed list. The lines are a
       * projection, so a local patch on the client would be a second, weaker
       * implementation of the same arithmetic; buying flour has to be able to
       * shorten an unrelated line that shares the ingredient.
       */
      const withLines = async (extra: Record<string, unknown> = {}) => {
        const projected = await projectShoppingList(db, householdId);
        return Response.json({ ok: true, ...extra, lines: projected.lines });
      };

      if (body.action === "add_demand") {
        // Demands always link to a real ingredient (migration 068): a
        // free-text name finds or creates the entity.
        const link = {
          name: body.name,
          ingredient_id: body.ingredient_id ?? null,
          unit: body.unit ?? null,
        };
        await ensureIngredientIds(query, [link]);
        const res = await query<{ id: string }>(
          `INSERT INTO shopping_list_demands (
             shopping_list_id, ingredient_id, name, amount, unit, note, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            listId,
            link.ingredient_id,
            body.name,
            body.amount ?? null,
            body.unit ?? null,
            body.note ?? null,
            userId,
          ],
        );
        return await withLines({ demand_id: res.rows[0].id });
      }

      if (body.action === "remove_line") {
        // Removing a projected line means dropping the demand behind it. Manual
        // demands are deleted; planned meals are excluded from the list instead
        // of being deleted outright, since the meal is still planned.
        await query(
          `DELETE FROM shopping_list_demands d
           WHERE d.shopping_list_id = $1
             AND fx_match_key(d.ingredient_id, d.name) = $2`,
          [listId, body.match_key],
        );
        await unbuyLine(db, { listId, householdId, matchKey: body.match_key });
        return await withLines();
      }

      if (body.action === "buy_line") {
        await buyLine(db, {
          listId,
          householdId,
          matchKey: body.match_key,
          ingredientId: body.ingredient_id ?? null,
          name: body.name,
          amount: body.amount ?? null,
          unit: body.unit ?? null,
          storeId: body.store_id ?? null,
          price: body.price ?? null,
          expiresAt: body.expires_at ?? null,
          userId,
        });
        return await withLines();
      }

      if (body.action === "unbuy_line") {
        await unbuyLine(db, {
          listId,
          householdId,
          matchKey: body.match_key,
        });
        return await withLines();
      }

      if (body.action === "set_store") {
        if (body.ingredient_id) {
          if (body.store_id) {
            // Remember it: the dropdown used to forget the choice on reload.
            await query(
              `INSERT INTO household_ingredient_stores (household_id, ingredient_id, store_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (household_id, ingredient_id)
               DO UPDATE SET store_id = EXCLUDED.store_id, updated_at = now()`,
              [householdId, body.ingredient_id, body.store_id],
            );
          } else {
            await query(
              "DELETE FROM household_ingredient_stores WHERE household_id = $1 AND ingredient_id = $2",
              [householdId, body.ingredient_id],
            );
          }
        }
        await query(
          "UPDATE shopping_list_purchases SET store_id = $1 WHERE shopping_list_id = $2 AND match_key = $3",
          [body.store_id, listId, body.match_key],
        );
        return await withLines();
      }

      if (body.action === "clear_bought") {
        // The stock stays: it was bought. Only the ticked-off lines clear.
        await query(
          "DELETE FROM shopping_list_purchases WHERE shopping_list_id = $1",
          [listId],
        );
        return await withLines();
      }

      if (body.action === "clear_all") {
        await query(
          "DELETE FROM shopping_list_demands WHERE shopping_list_id = $1",
          [listId],
        );
        await query(
          "DELETE FROM shopping_list_purchases WHERE shopping_list_id = $1",
          [listId],
        );
        await query(
          `UPDATE plan_entries SET include_in_list = false, updated_at = now()
           WHERE household_id = $1 AND status = 'planned'`,
          [householdId],
        );
        return await withLines();
      }

      if (body.action === "generate_share_link") {
        const token = crypto.randomUUID();
        await query(
          `UPDATE shopping_lists
           SET share_token = $1, share_token_expires_at = now() + interval '30 days'
           WHERE id = $2`,
          [token, listId],
        );
        return Response.json({ ok: true, share_token: token });
      }

      if (body.action === "revoke_share_link") {
        await query(
          "UPDATE shopping_lists SET share_token = NULL, share_token_expires_at = NULL WHERE id = $1",
          [listId],
        );
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Unknown action" }, { status: 400 });
    });
  },
});
