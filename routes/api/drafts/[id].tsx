import { define } from "../../../utils.ts";
import type { RecipeDraft } from "../../../db/types.ts";
import { DraftUpdateBody, parseJsonBody } from "../../../lib/validation.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await ctx.state.db.query<RecipeDraft>(
      "SELECT * FROM recipe_drafts WHERE id = $1 AND household_id = $2",
      [ctx.params.id, ctx.state.householdId],
    );

    if (res.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(res.rows[0]), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async PATCH(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await parseJsonBody(ctx.req, DraftUpdateBody);
    if (!result.success) return result.response;
    const body = result.data;
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let p = 1;

    if (body.recipe_data !== undefined) {
      sets.push(`recipe_data = $${p}`);
      params.push(JSON.stringify(body.recipe_data));
      p++;
    }
    if (body.ai_messages !== undefined) {
      sets.push(`ai_messages = $${p}`);
      params.push(JSON.stringify(body.ai_messages));
      p++;
    }
    if (body.ai_thinking !== undefined) {
      sets.push(`ai_thinking = $${p}`);
      params.push(body.ai_thinking);
      p++;
    }
    if (body.cover_image_id !== undefined) {
      sets.push(`cover_image_id = $${p}`);
      params.push(body.cover_image_id);
      p++;
    }

    params.push(ctx.params.id, ctx.state.householdId);

    const res = await ctx.state.db.query<RecipeDraft>(
      `UPDATE recipe_drafts SET ${sets.join(", ")}
       WHERE id = $${p} AND household_id = $${p + 1}
       RETURNING *`,
      params,
    );

    if (res.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(res.rows[0]), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async DELETE(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ctx.state.db.query(
      "DELETE FROM recipe_drafts WHERE id = $1 AND household_id = $2",
      [ctx.params.id, ctx.state.householdId],
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
