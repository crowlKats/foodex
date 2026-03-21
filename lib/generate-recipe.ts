import Anthropic from "@anthropic-ai/sdk";
import { recipeJsonSchema, RECIPE_FIELD_RULES } from "./recipe-prompt.ts";
import type { OcrRecipeData, OcrUsage } from "./ocr.ts";

const SYSTEM_PROMPT =
  `You are a creative recipe generation assistant. Given a list of ingredients the user has on hand, generate a recipe that uses some or all of them.

${recipeJsonSchema()}

Rules:
- You do NOT need to use every ingredient — pick a coherent subset that makes a good dish
- You MUST only use ingredients from the provided list. The ONLY exceptions are: salt, pepper, oil, water, and basic spices. Do NOT add other ingredients like pasta, rice, flour, bread, etc. unless they are explicitly listed.
${RECIPE_FIELD_RULES}
- "cover_image" should always be null for generated recipes`;

interface PantryIngredient {
  name: string;
  amount?: number;
  unit?: string;
}

export async function generateRecipeFromPantry(
  ingredients: PantryIngredient[],
  opts: { maxMinutes?: number; instructions?: string },
): Promise<{ recipe: OcrRecipeData; usage: OcrUsage }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  if (ingredients.length === 0) {
    throw new Error("No ingredients provided");
  }

  const client = new Anthropic({ apiKey });

  const ingredientList = ingredients
    .map((i) => {
      let s = i.name;
      if (i.amount != null) s += ` (${i.amount}${i.unit ? ` ${i.unit}` : ""} available)`;
      return `- ${s}`;
    })
    .join("\n");

  const parts = [
    `Here are the ingredients I have:\n${ingredientList}`,
  ];
  if (opts.maxMinutes) {
    parts.push(`\nTotal time (prep + cook) must not exceed ${opts.maxMinutes} minutes.`);
  }
  if (opts.instructions?.trim()) {
    parts.push(`\nAdditional instructions: ${opts.instructions.trim()}`);
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    temperature: 1, // required for extended thinking
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
    messages: [
      {
        role: "user",
        content: parts.join("\n"),
      },
    ],
    system: SYSTEM_PROMPT,
  });

  for (const block of response.content) {
    if (block.type === "thinking") {
      console.log("[generate-recipe] thinking:", block.thinking);
    }
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI");
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return {
    recipe: JSON.parse(jsonText) as OcrRecipeData,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      model: response.model,
    },
  };
}
