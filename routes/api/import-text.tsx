import { define } from "../../utils.ts";
import { extractRecipeFromText } from "../../lib/text-import.ts";
import { ImportTextBody, parseJsonBody } from "../../lib/validation.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await parseJsonBody(ctx.req, ImportTextBody);
    if (!result.success) return result.response;
    const body = result.data;

    try {
      const { recipe } = await extractRecipeFromText(body.text, body.context);
      return new Response(JSON.stringify(recipe), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Text import error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to extract recipe from text" }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
});
