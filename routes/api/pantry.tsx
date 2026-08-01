import { handler } from "./$pantry.ts";
import type { QueryFn } from "../../db/mod.ts";
import { addStock, mergeStock } from "../../lib/pantry.ts";
import { PantryAction, parseJsonBody } from "../../lib/validation.ts";

/**
 * Link a pantry entry to a real ingredient, creating the entity when the user
 * typed a new name. Unlinked rows only ever match by string, so linking here is
 * what lets stock survive a rename and match a recipe reliably.
 */
async function resolveIngredient(
  db: { query: QueryFn },
  body: {
    /** Null when the caller typed a free-text name instead of picking one. */
    ingredient_id?: string | null;
    create_ingredient?: boolean;
    name: string;
    unit?: string | null;
    brand?: string;
    store_id?: string;
    price?: number;
    amount?: number | null;
  },
): Promise<string | null> {
  let ingredientId = body.ingredient_id ?? null;

  if (!ingredientId && body.name.trim()) {
    // Reuse an existing ingredient with the same name before creating one —
    // otherwise every hand-typed "Flour" becomes a new unlinked entity.
    const existing = await db.query<{ id: string }>(
      "SELECT id FROM ingredients WHERE lower(name) = lower($1) LIMIT 1",
      [body.name.trim()],
    );
    if (existing.rows.length > 0) {
      ingredientId = existing.rows[0].id;
    } else if (body.create_ingredient) {
      const created = await db.query<{ id: string }>(
        "INSERT INTO ingredients (name, unit) VALUES ($1, $2) RETURNING id",
        [body.name.trim(), body.unit ?? null],
      );
      ingredientId = created.rows[0].id;
    }
  }

  if (!ingredientId) return null;

  let brandId: string | null = null;
  if (body.brand?.trim()) {
    const existingBrand = await db.query<{ id: string }>(
      "SELECT id FROM ingredient_brands WHERE ingredient_id = $1 AND lower(brand) = lower($2)",
      [ingredientId, body.brand.trim()],
    );
    brandId = existingBrand.rows.length > 0
      ? existingBrand.rows[0].id
      : (await db.query<{ id: string }>(
        "INSERT INTO ingredient_brands (ingredient_id, brand) VALUES ($1, $2) RETURNING id",
        [ingredientId, body.brand.trim()],
      )).rows[0].id;
  }

  if (body.store_id && body.price != null) {
    await db.query(
      `INSERT INTO ingredient_prices (ingredient_id, brand_id, store_id, price, amount, unit)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ingredientId,
        brandId,
        body.store_id,
        body.price,
        body.amount ?? null,
        body.unit ?? null,
      ],
    );
  }

  return ingredientId;
}

export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const result = await parseJsonBody(ctx.req, PantryAction);
    if (!result.success) return result.response;
    const body = result.data;
    const householdId = ctx.state.householdId;
    const userId = ctx.state.user?.id ?? null;

    if (body.action === "add") {
      return await ctx.state.db.transaction(async (query) => {
        const db = { query };
        const ingredientId = await resolveIngredient(db, body);
        const added = await addStock(db, {
          householdId,
          ingredientId,
          name: body.name,
          amount: body.amount ?? null,
          unit: body.unit ?? null,
          kind: "bought",
          storeId: body.store_id ?? null,
          unitPrice: body.price ?? null,
          expiresAt: body.expires_at ?? null,
          userId,
        });
        return Response.json({
          ok: true,
          id: added.pantryItemId,
          ingredient_id: ingredientId,
        });
      });
    }

    if (body.action === "update") {
      // A manual correction is still a stock movement: book the difference so
      // the ledger keeps reconciling against the balance.
      return await ctx.state.db.transaction(async (query) => {
        const before = await query<
          {
            amount: number | null;
            unit: string | null;
            name: string;
            ingredient_id: string | null;
          }
        >(
          "SELECT amount, unit, name, ingredient_id FROM pantry_items WHERE id = $1 AND household_id = $2",
          [body.item_id, householdId],
        );
        if (before.rows.length === 0) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const row = before.rows[0];

        await query(
          `UPDATE pantry_items
           SET amount = $1, unit = $2, expires_at = $3, updated_at = now()
           WHERE id = $4 AND household_id = $5`,
          [
            body.amount ?? null,
            body.unit ?? null,
            body.expires_at ?? null,
            body.item_id,
            householdId,
          ],
        );

        const sameUnit = (row.unit ?? null) === (body.unit ?? null);
        const delta = sameUnit && body.amount != null && row.amount != null
          ? body.amount - Number(row.amount)
          : null;
        if (delta != null && delta !== 0) {
          await query(
            `INSERT INTO pantry_transactions (
               household_id, pantry_item_id, ingredient_id, name, amount, unit,
               kind, source_type, note, created_by
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'adjusted', 'manual', $7, $8)`,
            [
              householdId,
              body.item_id,
              row.ingredient_id,
              row.name,
              delta,
              body.unit ?? null,
              "Corrected by hand",
              userId,
            ],
          );
        }
        return Response.json({ ok: true });
      });
    }

    if (body.action === "remove") {
      return await ctx.state.db.transaction(async (query) => {
        const before = await query<{
          amount: number | null;
          unit: string | null;
          name: string;
          ingredient_id: string | null;
        }>(
          "SELECT amount, unit, name, ingredient_id FROM pantry_items WHERE id = $1 AND household_id = $2",
          [body.item_id, householdId],
        );
        if (before.rows.length > 0) {
          const row = before.rows[0];
          await query(
            `INSERT INTO pantry_transactions (
               household_id, ingredient_id, name, amount, unit, kind,
               source_type, note, created_by
             )
             VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7, $8)`,
            [
              householdId,
              row.ingredient_id,
              row.name,
              row.amount != null ? -Number(row.amount) : null,
              row.unit,
              body.reason ?? "wasted",
              body.reason === "adjusted" ? "Removed by hand" : "Thrown out",
              userId,
            ],
          );
        }
        await query(
          "DELETE FROM pantry_items WHERE id = $1 AND household_id = $2",
          [body.item_id, householdId],
        );
        return Response.json({ ok: true });
      });
    }

    if (body.action === "merge") {
      return await ctx.state.db.transaction(async (query) => {
        try {
          const merged = await mergeStock(
            { query },
            householdId,
            body.target_id,
            body.source_ids,
          );
          return Response.json({ ok: true, ...merged });
        } catch {
          return Response.json({ error: "Target item not found" }, {
            status: 404,
          });
        }
      });
    }

    if (body.action === "set_staple") {
      await ctx.state.db.query(
        "UPDATE pantry_items SET staple = $1, updated_at = now() WHERE id = $2 AND household_id = $3",
        [body.staple, body.item_id, householdId],
      );
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  },
});
