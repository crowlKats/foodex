import Anthropic from "@anthropic-ai/sdk";
import { define } from "../../utils.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import {
  RECIPE_FIELD_RULES,
  recipeJsonSchema,
} from "../../lib/recipe-prompt.ts";
import type { OcrRecipeData } from "../../lib/ocr.ts";

const SYSTEM_PROMPT =
  `You are a recipe editing assistant. The user will give you an existing recipe as JSON and ask you to modify it.

${recipeJsonSchema()}

Rules:
${RECIPE_FIELD_RULES}
- "cover_image" should always be null
- Preserve all fields from the original recipe unless the user specifically asks to change them
- Apply the user's requested changes accurately`;

export const handler = define.handlers({
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

    const body = await ctx.req.json();
    const messages = body.messages as {
      role: "user" | "assistant";
      content: string;
    }[];

    if (
      !messages || messages.length === 0 ||
      messages[messages.length - 1].role !== "user"
    ) {
      return new Response(
        JSON.stringify({
          error: "Messages are required, ending with a user message",
        }),
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
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        temperature: 1,
        thinking: {
          type: "enabled",
          budget_tokens: 10000,
        },
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        system: SYSTEM_PROMPT,
      });

      const thinkingBlock = response.content.find((b) => b.type === "thinking");
      const thinking = thinkingBlock?.type === "thinking"
        ? thinkingBlock.thinking
        : null;

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

      const recipe = JSON.parse(jsonText) as OcrRecipeData;

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

      return new Response(JSON.stringify({ recipe, thinking }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Recipe refinement error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to refine recipe" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
});
