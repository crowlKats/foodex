import Anthropic from "@anthropic-ai/sdk";
import { ALL_UNITS } from "./units.ts";
import { DOCS as TEMPLATE_DOCS } from "../routes/docs/templates.md.tsx";

export interface CoverImageBounds {
  image_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrRecipeData {
  title: string;
  description: string;
  prep_time: number | null;
  cook_time: number | null;
  quantity_type: string;
  quantity_value: number;
  quantity_unit: string;
  ingredients: { key: string; name: string; amount: string; unit: string }[];
  steps: { title: string; body: string }[];
  cover_image: CoverImageBounds | null;
}

const SYSTEM_PROMPT =
  `You are a recipe extraction assistant. Given an image of a recipe (from a cookbook, screenshot, handwritten note, etc.), extract the recipe data as structured JSON.

Return ONLY valid JSON with this exact shape:
{
  "title": "Recipe title",
  "description": "Brief description of the dish",
  "prep_time": <number in minutes or null>,
  "cook_time": <number in minutes or null>,
  "quantity_type": "servings",
  "quantity_value": <number>,
  "quantity_unit": "servings",
  "ingredients": [
    { "key": "snake_case_key", "name": "Ingredient name", "amount": "numeric amount as string", "unit": "unit" }
  ],
  "steps": [
    { "title": "Step title (short)", "body": "Detailed step instructions" }
  ],
  "cover_image": { "image_index": 0, "x": 0.1, "y": 0.05, "width": 0.8, "height": 0.4 } or null
}

Rules:
- "key" must be a unique snake_case identifier derived from the ingredient name (e.g. "all_purpose_flour", "olive_oil")
- "amount" must be a numeric string (e.g. "200", "1.5") or empty string if unspecified
- "unit" must be one of these exact values: ${
    ALL_UNITS.join(", ")
  } — or empty string if no unit applies
- "quantity_type" should be "servings" unless the recipe specifies weight/volume/dimensions
- If prep or cook time is not specified, use null
- Step titles should be short (2-4 words). Step bodies support Markdown and a template syntax for dynamic ingredient scaling. Only use template refs when an ingredient amount is explicitly mentioned in a step — if a step just names an ingredient without a specific quantity, use plain text.
- Template syntax reference:
${TEMPLATE_DOCS}
- "cover_image": If the image(s) contain a photograph of the finished dish, return its bounding box as { "image_index": <0-based index of which image>, "x": <left edge 0-1>, "y": <top edge 0-1>, "width": <0-1>, "height": <0-1> } where all values are fractions of the image dimensions. If there is no food photo, return null.
- If the image contains multiple recipes, extract only the most prominent one
- The recipe may be in ANY language — ALWAYS translate all text (title, description, ingredient names, step instructions) to English
- Return ONLY the JSON object, no markdown fences or extra text`;

interface ImageInput {
  bytes: Uint8Array;
  contentType: string;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function extractRecipeFromImages(
  images: ImageInput[],
  context?: string,
): Promise<OcrRecipeData> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  if (images.length === 0) {
    throw new Error("No images provided");
  }

  const client = new Anthropic({ apiKey });

  const imageBlocks: Anthropic.ImageBlockParam[] = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.contentType as ImageMediaType,
      data: btoa(
        img.bytes.reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      ),
    },
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: [
              images.length > 1
                ? "These images are pages/photos of the same recipe. Extract the complete recipe from all images combined as structured JSON following the schema described in your instructions."
                : "Extract the recipe from this image as structured JSON following the schema described in your instructions.",
              context ? `\nAdditional context from the user: ${context}` : "",
            ].join(""),
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from OCR");
  }

  let jsonText = textBlock.text.trim();
  // Strip markdown code fences if present
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonText) as OcrRecipeData;
}
