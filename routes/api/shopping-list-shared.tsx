import { define } from "../../utils.ts";
import type { ShoppingList } from "../../db/types.ts";
import {
  parseJsonBody,
  ShoppingListSharedBody,
} from "../../lib/validation.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const result = await parseJsonBody(ctx.req, ShoppingListSharedBody);
    if (!result.success) return result.response;
    const body = result.data;

    const listRes = await ctx.state.db.query<Pick<ShoppingList, "id">>(
      "SELECT id FROM shopping_lists WHERE share_token = $1 AND (share_token_expires_at IS NULL OR share_token_expires_at > now())",
      [body.token],
    );
    if (listRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid link" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const listId = listRes.rows[0].id;

    await ctx.state.db.query(
      "UPDATE shopping_list_items SET checked = $1 WHERE id = $2 AND shopping_list_id = $3",
      [body.checked, body.item_id, listId],
    );
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
