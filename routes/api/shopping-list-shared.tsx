import { define } from "../../utils.ts";
import type { ShoppingList } from "../../db/types.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const body = await ctx.req.json();
    const { token } = body;
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const listRes = await ctx.state.db.query<Pick<ShoppingList, "id">>(
      "SELECT id FROM shopping_lists WHERE share_token = $1",
      [token],
    );
    if (listRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid link" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const listId = listRes.rows[0].id;

    if (body.action === "toggle_checked") {
      const { item_id, checked } = body;
      if (typeof item_id !== "number" || typeof checked !== "boolean") {
        return new Response(JSON.stringify({ error: "Invalid params" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      await ctx.state.db.query(
        "UPDATE shopping_list_items SET checked = $1 WHERE id = $2 AND shopping_list_id = $3",
        [checked, item_id, listId],
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  },
});
