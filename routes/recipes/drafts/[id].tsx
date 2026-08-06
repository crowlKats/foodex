// Legacy recipe drafts (from the old import flows) migrate into an assistant
// session on open: the draft becomes a user-staged recipe in the session's
// editor view, and the draft row is consumed. Old draft links keep working
// until the table drains.

import { handler } from "./$[id].ts";
import { HttpError } from "fresh/errors";
import type { RecipeDraft } from "../../../db/types.ts";
import { appendEvent, createSession } from "../../../lib/agent/session.ts";

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const res = await ctx.state.db.query<RecipeDraft>(
      "SELECT * FROM recipe_drafts WHERE id = $1 AND household_id = $2",
      [ctx.params.id, ctx.state.householdId],
    );
    if (res.rows.length === 0) throw new HttpError(404);
    const draft = res.rows[0];

    const data = { ...(draft.recipe_data as Record<string, unknown>) };
    // The extraction shape has no step ids and may carry an OCR crop bbox,
    // which is not a recipe field.
    data.steps = (Array.isArray(data.steps) ? data.steps : []).map((s, i) => {
      const step = s as Record<string, unknown>;
      return { ...step, id: step.id ?? `tmp_${i}` };
    });
    delete data.cover_image;
    if (draft.cover_image_id) {
      data.cover_image_id = String(draft.cover_image_id);
    }

    const title = typeof data.title === "string" && data.title.trim()
      ? data.title.trim().slice(0, 60)
      : "Recipe draft";

    let sessionId = "";
    await ctx.state.db.transaction(async (q) => {
      const session = await createSession(
        q,
        ctx.state.user!.id,
        ctx.state.householdId!,
        title,
      );
      sessionId = session.id;
      await appendEvent(q, session.id, {
        type: "user_staged",
        payload: {
          mutation: {
            kind: "create_recipe",
            op: "create",
            item_id: crypto.randomUUID(),
            full: data,
          },
        },
      });
      await q("DELETE FROM recipe_drafts WHERE id = $1", [draft.id]);
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/agent/${sessionId}` },
    });
  },
});
