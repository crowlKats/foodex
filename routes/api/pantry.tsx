import { define } from "../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, { status: 401 });
    }

    const body = await ctx.req.json();
    const householdId = body.household_id;

    // Verify membership
    const memberCheck = await ctx.state.db.query(
      "SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2",
      [householdId, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not a member" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "add") {
      const res = await ctx.state.db.query(
        `INSERT INTO pantry_items (household_id, ingredient_id, name, amount, unit)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          householdId,
          body.ingredient_id ?? null,
          body.name,
          body.amount ?? null,
          body.unit ?? null,
        ],
      );
      return new Response(
        JSON.stringify({ ok: true, id: res.rows[0].id }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.action === "update") {
      await ctx.state.db.query(
        `UPDATE pantry_items SET amount = $1, unit = $2, updated_at = now()
         WHERE id = $3 AND household_id = $4`,
        [body.amount ?? null, body.unit ?? null, body.item_id, householdId],
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
      const items = body.items as {
        ingredient_id: number | null;
        name: string;
        amount: number | null;
        unit: string | null;
      }[];

      for (const item of items) {
        if (item.amount == null || item.amount <= 0) continue;

        let existing;
        if (item.ingredient_id) {
          existing = await ctx.state.db.query(
            `SELECT id, amount FROM pantry_items
             WHERE household_id = $1 AND ingredient_id = $2 AND COALESCE(unit, '') = COALESCE($3, '')`,
            [householdId, item.ingredient_id, item.unit],
          );
        } else {
          existing = await ctx.state.db.query(
            `SELECT id, amount FROM pantry_items
             WHERE household_id = $1 AND lower(name) = lower($2) AND COALESCE(unit, '') = COALESCE($3, '')`,
            [householdId, item.name, item.unit],
          );
        }

        if (existing.rows.length > 0) {
          const currentAmount = Number(existing.rows[0].amount) || 0;
          const newAmount = currentAmount - item.amount;
          if (newAmount <= 0) {
            await ctx.state.db.query(
              "DELETE FROM pantry_items WHERE id = $1",
              [existing.rows[0].id],
            );
          } else {
            await ctx.state.db.query(
              "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
              [newAmount, existing.rows[0].id],
            );
          }
        }
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  },
});
