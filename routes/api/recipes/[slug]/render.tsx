import { define } from "../../../../utils.ts";
import { renderRecipeBody } from "../../../../lib/markdown.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const servings = Number(ctx.url.searchParams.get("servings")) || 4;

    const recipeRes = await ctx.state.db.query(
      "SELECT body FROM recipes WHERE slug = $1",
      [slug],
    );
    if (recipeRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = String(recipeRes.rows[0].body);
    const html = await renderRecipeBody(
      body,
      { servings },
      async (refSlug) => {
        const res = await ctx.state.db.query(
          "SELECT title, slug FROM recipes WHERE slug = $1",
          [refSlug],
        );
        if (res.rows.length === 0) return null;
        return {
          title: String(res.rows[0].title),
          slug: String(res.rows[0].slug),
        };
      },
    );

    return new Response(JSON.stringify({ html }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
