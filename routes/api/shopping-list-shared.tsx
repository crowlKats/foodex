import { handler } from "./$shopping-list-shared.ts";
import { buyLine, unbuyLine } from "../../lib/shopping-list.ts";
import { parseJsonBody, ShoppingListSharedBody } from "../../lib/validation.ts";

/**
 * The shared link now goes through the same purchase path as the logged-in
 * list. Previously it only flipped a flag, so the person actually standing in
 * the shop was the one whose check-offs never reached the pantry.
 */
export const handlers = handler({
  async POST(ctx) {
    const result = await parseJsonBody(ctx.req, ShoppingListSharedBody);
    if (!result.success) return result.response;
    const body = result.data;

    const listRes = await ctx.state.db.query<
      { id: string; household_id: string }
    >(
      `SELECT id, household_id FROM shopping_lists
       WHERE share_token = $1
         AND (share_token_expires_at IS NULL OR share_token_expires_at > now())`,
      [body.token],
    );
    if (listRes.rows.length === 0) {
      return Response.json({ error: "Invalid link" }, { status: 404 });
    }
    const { id: listId, household_id: householdId } = listRes.rows[0];

    return await ctx.state.db.transaction(async (query) => {
      if (body.action === "unbuy_line") {
        const ok = await unbuyLine({ query }, {
          listId,
          householdId,
          matchKey: body.match_key,
        });
        return Response.json({ ok });
      }

      if (!body.name) {
        return Response.json({ error: "Missing name" }, { status: 400 });
      }
      const bought = await buyLine({ query }, {
        listId,
        householdId,
        matchKey: body.match_key,
        ingredientId: body.ingredient_id ?? null,
        name: body.name,
        amount: body.amount ?? null,
        unit: body.unit ?? null,
      });
      return Response.json(bought);
    });
  },
});
