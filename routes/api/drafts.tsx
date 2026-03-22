import { define } from "../../utils.ts";
import type { RecipeDraft } from "../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await ctx.state.db.query<RecipeDraft>(
      `SELECT * FROM recipe_drafts
       WHERE household_id = $1
       ORDER BY updated_at DESC`,
      [ctx.state.householdId],
    );

    return new Response(JSON.stringify(res.rows), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await ctx.req.json();

    const res = await ctx.state.db.query<{ id: string }>(
      `INSERT INTO recipe_drafts (household_id, recipe_data, ai_messages, ai_thinking, cover_image_id, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        ctx.state.householdId,
        JSON.stringify(body.recipe_data ?? {}),
        JSON.stringify(body.ai_messages ?? []),
        body.ai_thinking ?? null,
        body.cover_image_id ?? null,
        body.source ?? "manual",
      ],
    );

    return new Response(JSON.stringify({ id: res.rows[0].id }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
