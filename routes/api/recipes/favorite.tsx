import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, { status: 401 });
    }

    const { recipe_id } = await ctx.req.json();
    if (!recipe_id) {
      return new Response(JSON.stringify({ error: "recipe_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const existing = await ctx.state.db.query<{ "?column?": number }>(
      "SELECT 1 FROM recipe_favorites WHERE user_id = $1 AND recipe_id = $2",
      [ctx.state.user.id, recipe_id],
    );

    if (existing.rows.length > 0) {
      await ctx.state.db.query(
        "DELETE FROM recipe_favorites WHERE user_id = $1 AND recipe_id = $2",
        [ctx.state.user.id, recipe_id],
      );
      return new Response(JSON.stringify({ favorited: false }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      await ctx.state.db.query(
        "INSERT INTO recipe_favorites (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [ctx.state.user.id, recipe_id],
      );
      return new Response(JSON.stringify({ favorited: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
