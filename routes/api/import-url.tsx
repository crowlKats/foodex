import { define } from "../../utils.ts";
import { importRecipeFromUrl } from "../../lib/url-import.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await ctx.req.json();
    const url = body.url;

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const recipe = await importRecipeFromUrl(url);
      return new Response(JSON.stringify(recipe), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: (err as Error).message }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
});
