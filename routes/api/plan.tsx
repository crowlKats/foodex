import { handler } from "./$plan.ts";
import {
  addPlanEntry,
  cookNow,
  cookPlanEntry,
  uncookPlanEntry,
} from "../../lib/plan.ts";
import { parseJsonBody, PlanAction } from "../../lib/validation.ts";

export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, { status: 401 });
    }

    const result = await parseJsonBody(ctx.req, PlanAction);
    if (!result.success) return result.response;
    const body = result.data;
    const householdId = ctx.state.householdId;
    const userId = ctx.state.user.id;

    if (body.action === "add") {
      const entryId = await addPlanEntry(ctx.state.db, {
        householdId,
        recipeId: body.recipe_id,
        scale: body.scale,
        plannedFor: body.planned_for,
        includeInList: body.include_in_list,
        note: body.note,
        userId,
      });
      return Response.json({ ok: true, entry_id: entryId });
    }

    if (body.action === "update") {
      await ctx.state.db.query(
        `UPDATE plan_entries
         SET scale = COALESCE($1, scale),
             planned_for = COALESCE($2, planned_for),
             include_in_list = COALESCE($3, include_in_list),
             status = COALESCE($4, status),
             updated_at = now()
         WHERE id = $5 AND household_id = $6 AND status <> 'cooked'`,
        [
          body.scale ?? null,
          body.planned_for ?? null,
          body.include_in_list ?? null,
          body.status ?? null,
          body.entry_id,
          householdId,
        ],
      );
      return Response.json({ ok: true });
    }

    if (body.action === "remove") {
      // Cooked entries are history and stay; removing one would orphan the
      // ledger transactions that reference it.
      await ctx.state.db.query(
        "DELETE FROM plan_entries WHERE id = $1 AND household_id = $2 AND status <> 'cooked'",
        [body.entry_id, householdId],
      );
      return Response.json({ ok: true });
    }

    if (body.action === "cook") {
      return await ctx.state.db.transaction(async (query) => {
        const cooked = await cookPlanEntry(
          { query },
          householdId,
          body.entry_id,
          userId,
        );
        return Response.json(cooked);
      });
    }

    if (body.action === "uncook") {
      return await ctx.state.db.transaction(async (query) => {
        const ok = await uncookPlanEntry({ query }, householdId, body.entry_id);
        return Response.json({ ok });
      });
    }

    if (body.action === "cook_now") {
      return await ctx.state.db.transaction(async (query) => {
        const cooked = await cookNow({ query }, {
          householdId,
          recipeId: body.recipe_id,
          scale: body.scale,
          userId,
        });
        return Response.json(cooked);
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  },
});
