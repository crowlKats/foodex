import { handler } from "./$substitutions.ts";
import { generateText } from "ai";
import { costOf, getModel, hasCredentials } from "../../lib/agent/model.ts";
import { recordUsage } from "../../lib/agent/usage.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import { parseJsonBody, SubstitutionsBody } from "../../lib/validation.ts";

export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!rateLimit(`ai:${ctx.state.user.id}`, 10, 60_000)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await parseJsonBody(ctx.req, SubstitutionsBody);
    if (!result.success) return result.response;
    const body = result.data;
    const ingredientName = body.ingredient;
    const recipeTitle = body.recipe_title;
    const allIngredients = body.all_ingredients;

    if (!hasCredentials()) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const ingredientContext = allIngredients?.length
        ? `\nThe full ingredient list for the recipe is: ${
          allIngredients.join(", ")
        }.`
        : "";

      const { text, response, finalStep } = await generateText({
        model: getModel(),
        maxOutputTokens: 1024,
        messages: [
          {
            role: "user",
            content:
              `I'm making "${recipeTitle}" and I don't have "${ingredientName}".${ingredientContext}\n\nSuggest up to 5 substitutions for "${ingredientName}" in this recipe. Only include substitutions that would genuinely work in the dish; if the ingredient is essential or there's no reasonable home-kitchen alternative, return an empty array. Quality over quantity: it is better to return 0 or 1 good options than to pad with poor ones. For each suggestion, give:\n- The substitute ingredient name\n- The ratio (e.g. "use same amount" or "use half as much")\n- A brief note on how it changes the dish\n\nRespond as JSON array: [{"name": "...", "ratio": "...", "note": "..."}]. Return [] if no good substitution exists.`,
          },
        ],
        instructions:
          "You are a knowledgeable cooking assistant. Suggest practical ingredient substitutions that maintain the dish's character. Only suggest substitutes that would actually work — never pad the list with weak or unusual alternatives just to hit a count. An empty array is the correct answer when nothing reasonable substitutes for the ingredient. Respond with ONLY the JSON array, no other text.",
      });

      if (!text.trim()) throw new Error("No text response from AI");

      let jsonText = text.trim();
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

      // Not tied to a chat, so session_id stays null.
      await recordUsage(ctx.state.db.query, {
        userId: ctx.state.user.id,
        // The model the auto router actually chose for this request.
        model: response.modelId,
        cost: costOf(finalStep.providerMetadata),
      });

      return new Response(JSON.stringify({ substitutions }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Substitution error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to find substitutions" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
});
