import Anthropic from "@anthropic-ai/sdk";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await ctx.req.json();
    const ingredientName = body.ingredient as string;
    const recipeTitle = body.recipe_title as string;
    const allIngredients = body.all_ingredients as string[];

    if (!ingredientName || !recipeTitle) {
      return new Response(
        JSON.stringify({ error: "ingredient and recipe_title are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const client = new Anthropic({ apiKey });

      const ingredientContext = allIngredients?.length
        ? `\nThe full ingredient list for the recipe is: ${allIngredients.join(", ")}.`
        : "";

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content:
              `I'm making "${recipeTitle}" and I don't have "${ingredientName}".${ingredientContext}\n\nSuggest 3-5 substitutions for "${ingredientName}" in this recipe. For each, give:\n- The substitute ingredient name\n- The ratio (e.g. "use same amount" or "use half as much")\n- A brief note on how it changes the dish\n\nRespond as JSON array: [{"name": "...", "ratio": "...", "note": "..."}]`,
          },
        ],
        system:
          "You are a knowledgeable cooking assistant. Suggest practical ingredient substitutions that maintain the dish's character. Respond with ONLY the JSON array, no other text.",
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from AI");
      }

      let jsonText = textBlock.text.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(
          /\n?```$/,
          "",
        );
      }

      const substitutions = JSON.parse(jsonText) as {
        name: string;
        ratio: string;
        note: string;
      }[];

      await ctx.state.db.query(
        `INSERT INTO ocr_usage (user_id, input_tokens, output_tokens, model)
         VALUES ($1, $2, $3, $4)`,
        [
          ctx.state.user.id,
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.model,
        ],
      );

      return new Response(JSON.stringify({ substitutions }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
});
