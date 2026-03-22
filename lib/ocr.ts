import Anthropic from "@anthropic-ai/sdk";
import { RECIPE_FIELD_RULES, recipeJsonSchema } from "./recipe-prompt.ts";

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
  difficulty: string | null;
  quantity_type: string;
  quantity_value: number;
  quantity_unit: string;
  ingredients: { key: string; name: string; amount: string; unit: string }[];
  steps: { title: string; body: string }[];
  cover_image: CoverImageBounds | null;
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
}

const SYSTEM_PROMPT =
  `You are a recipe extraction assistant. Given an image of a recipe (from a cookbook, screenshot, handwritten note, etc.), extract the recipe data as structured JSON.

${recipeJsonSchema({ coverImage: true })}

Rules:
${RECIPE_FIELD_RULES}
- "cover_image": If the image(s) contain a photograph of food, return its bounding box as { "image_index": <0-based index of which image>, "x": <left edge 0-1>, "y": <top edge 0-1>, "width": <0-1>, "height": <0-1> } where all values are fractions of the image dimensions. Crop closely to the food photo, minimizing surrounding text or whitespace, but it's OK to include a small margin. Photos embedded in recipe pages, cookbook scans, or screenshots all count. If there is no food photo at all, return null.
- If the image contains multiple recipes, extract only the most prominent one
- The recipe may be in ANY language — ALWAYS translate all text (title, description, ingredient names, step instructions) to English
- Try hard to identify the source of the recipe from visual clues. Look for book titles, author names, website headers/URLs, watermarks, logos, or any attribution visible in the image. Set "source_type" to "book" for cookbook pages, "website" for screenshots of websites/blogs, "family" for handwritten notes, etc. Set "source_name" to the book title + author, website name, or other identifying info. Set "source_url" if a URL is visible in the image.`;

interface ImageInput {
  bytes: Uint8Array;
  contentType: string;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface OcrUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
}

export async function extractRecipeFromImages(
  images: ImageInput[],
  context?: string,
): Promise<{ recipe: OcrRecipeData; usage: OcrUsage }> {
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
