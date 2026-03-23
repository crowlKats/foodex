import { define } from "../../utils.ts";
import { convertAmount } from "../../lib/unit-convert.ts";
import { parseJsonBody, PantryAction } from "../../lib/validation.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const result = await parseJsonBody(ctx.req, PantryAction);
    if (!result.success) return result.response;
    const body = result.data;
    const householdId = ctx.state.householdId;

    if (body.action === "add") {
      let ingredientId = body.ingredient_id ?? null;

      // Create new ingredient if name provided but no existing ingredient selected
      if (!ingredientId && body.create_ingredient && body.name?.trim()) {
        const ingRes = await ctx.state.db.query<{ id: string }>(
          `INSERT INTO ingredients (name, unit) VALUES ($1, $2) RETURNING id`,
          [body.name.trim(), body.unit ?? null],
        );
        ingredientId = ingRes.rows[0].id;

        // Create brand if provided
        let brandId: string | null = null;
        if (body.brand?.trim()) {
          const brandRes = await ctx.state.db.query<{ id: string }>(
            `INSERT INTO ingredient_brands (ingredient_id, brand) VALUES ($1, $2) RETURNING id`,
            [ingredientId, body.brand.trim()],
          );
          brandId = brandRes.rows[0].id;
        }

        // Create price if store and price provided
        if (body.store_id && body.price != null) {
          await ctx.state.db.query(
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
      } else if (ingredientId) {
        // Existing ingredient — still add brand + price if provided
        let brandId: string | null = null;
        if (body.brand?.trim()) {
          // Use existing brand or create new one
          const existingBrand = await ctx.state.db.query<{ id: string }>(
            `SELECT id FROM ingredient_brands WHERE ingredient_id = $1 AND lower(brand) = lower($2)`,
            [ingredientId, body.brand.trim()],
          );
          if (existingBrand.rows.length > 0) {
            brandId = existingBrand.rows[0].id;
          } else {
            const brandRes = await ctx.state.db.query<{ id: string }>(
              `INSERT INTO ingredient_brands (ingredient_id, brand) VALUES ($1, $2) RETURNING id`,
              [ingredientId, body.brand.trim()],
            );
            brandId = brandRes.rows[0].id;
          }
        }

        if (body.store_id && body.price != null) {
          await ctx.state.db.query(
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
      }

      const res = await ctx.state.db.query(
        `INSERT INTO pantry_items (household_id, ingredient_id, name, amount, unit, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          householdId,
          ingredientId,
          body.name,
          body.amount ?? null,
          body.unit ?? null,
          body.expires_at ?? null,
        ],
      );
      return new Response(
        JSON.stringify({
          ok: true,
          id: res.rows[0].id,
          ingredient_id: ingredientId,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.action === "update") {
      await ctx.state.db.query(
        `UPDATE pantry_items SET amount = $1, unit = $2, expires_at = $3, updated_at = now()
         WHERE id = $4 AND household_id = $5`,
        [
          body.amount ?? null,
          body.unit ?? null,
          body.expires_at ?? null,
          body.item_id,
          householdId,
        ],
      );
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.action === "remove") {
      await ctx.state.db.query(
        "DELETE FROM pantry_items WHERE id = $1 AND household_id = $2",
        [body.item_id, householdId],
      );
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.action === "deduct_recipe") {
      const items = body.items;

      for (const item of items) {
        if (item.amount == null || item.amount <= 0) continue;

        // Find all matching pantry items, soonest-expiring first
        let existing;
        if (item.ingredient_id) {
          existing = await ctx.state.db.query<{
            id: string;
            amount: number | null;
            unit: string | null;
            density: number | null;
          }>(
            `SELECT pi.id, pi.amount, pi.unit, g.density
             FROM pantry_items pi
             LEFT JOIN ingredients g ON g.id = pi.ingredient_id
             WHERE pi.household_id = $1 AND pi.ingredient_id = $2
             ORDER BY pi.expires_at ASC NULLS LAST`,
            [householdId, item.ingredient_id],
          );
        } else {
          existing = await ctx.state.db.query<{
            id: string;
            amount: number | null;
            unit: string | null;
            density: number | null;
          }>(
            `SELECT pi.id, pi.amount, pi.unit, null as density
             FROM pantry_items pi
             WHERE pi.household_id = $1 AND lower(pi.name) = lower($2)
             ORDER BY pi.expires_at ASC NULLS LAST`,
            [householdId, item.name],
          );
        }

        let remaining = item.amount;
        for (const row of existing.rows) {
          if (remaining <= 0) break;

          const currentAmount = Number(row.amount) || 0;
          const pantryUnit = row.unit || "";
          const recipeUnit = item.unit || "";

          let deductAmount = remaining;
          if (pantryUnit !== recipeUnit) {
            const converted = convertAmount(
              remaining,
              recipeUnit,
              pantryUnit,
              row.density,
            );
            if (converted == null) continue;
            deductAmount = converted;
          }

          const newAmount = currentAmount - deductAmount;
          if (newAmount <= 0) {
            await ctx.state.db.query(
              "DELETE FROM pantry_items WHERE id = $1",
              [row.id],
            );
            // Calculate how much was actually consumed in recipe units
            const consumed = deductAmount + newAmount; // newAmount is negative or zero
            if (pantryUnit !== recipeUnit) {
              const back = convertAmount(
                consumed,
                pantryUnit,
                recipeUnit,
                row.density,
              );
              remaining -= back ?? remaining;
            } else {
              remaining -= consumed;
            }
          } else {
            await ctx.state.db.query(
              "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
              [newAmount, row.id],
            );
            remaining = 0;
          }
        }
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.action === "merge") {
      const targetId = body.target_id;
      const sourceIds = body.source_ids;

      // Fetch all involved items (target + sources) in one query
      const allIds = [targetId, ...sourceIds];
      const rows = await ctx.state.db.query<{
        id: string;
        amount: number | null;
        unit: string | null;
        expires_at: string | null;
        density: number | null;
      }>(
        `SELECT pi.id, pi.amount, pi.unit, pi.expires_at, g.density
         FROM pantry_items pi
         LEFT JOIN ingredients g ON g.id = pi.ingredient_id
         WHERE pi.id = ANY($1) AND pi.household_id = $2`,
        [allIds, householdId],
      );

      const rowMap = new Map<string, typeof rows.rows[0]>(
        rows.rows.map((r) => [r.id, r]),
      );
      const target = rowMap.get(targetId);
      if (!target) {
        return new Response(
          JSON.stringify({ error: "Target item not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      const targetUnit = target.unit || "";
      let totalAmount: number | null = target.amount != null
        ? Number(target.amount)
        : null;
      let latestExpiry: string | null = target.expires_at;

      const validSourceIds: string[] = [];
      for (const srcId of sourceIds) {
        const src = rowMap.get(srcId);
        if (!src) continue;

        // Sum amounts with unit conversion
        if (src.amount != null) {
          const srcUnit = src.unit || "";
          let srcAmount = Number(src.amount);
          if (srcUnit !== targetUnit && targetUnit && srcUnit) {
            const converted = convertAmount(
              srcAmount,
              srcUnit,
              targetUnit,
              src.density,
            );
            if (converted != null) {
              srcAmount = converted;
            } else {
              // Can't convert — skip amount summing, just add as-is
              // (better to approximate than lose the amount)
              srcAmount = Number(src.amount);
            }
          }
          totalAmount = (totalAmount ?? 0) + srcAmount;
        }

        // Keep the latest expiration date
        if (src.expires_at) {
          if (!latestExpiry || src.expires_at > latestExpiry) {
            latestExpiry = src.expires_at;
          }
        }

        validSourceIds.push(srcId);
      }

      if (validSourceIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "No valid source items" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Update target with merged values
      await ctx.state.db.query(
        `UPDATE pantry_items SET amount = $1, expires_at = $2, updated_at = now()
         WHERE id = $3 AND household_id = $4`,
        [totalAmount, latestExpiry, targetId, householdId],
      );

      // Delete source items
      await ctx.state.db.query(
        `DELETE FROM pantry_items WHERE id = ANY($1) AND household_id = $2`,
        [validSourceIds, householdId],
      );

      return new Response(
        JSON.stringify({
          ok: true,
          amount: totalAmount,
          expires_at: latestExpiry,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  },
});
