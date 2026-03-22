import { ALL_UNITS } from "./units.ts";
import { DOCS as TEMPLATE_DOCS } from "../routes/docs/templates.md.tsx";

/** JSON schema + shared rules for recipe output, used by both OCR and generation prompts. */
export function recipeJsonSchema(opts?: { coverImage?: boolean }): string {
  const coverLine = opts?.coverImage
    ? `  "cover_image": { "image_index": 0, "x": 0.1, "y": 0.05, "width": 0.8, "height": 0.4 } or null`
    : `  "cover_image": null`;

  return `Return ONLY valid JSON with this exact shape:
{
  "title": "Recipe title",
  "description": "Brief description of the dish",
  "prep_time": <number in minutes or null>,
  "cook_time": <number in minutes or null>,
  "difficulty": "easy" | "medium" | "hard" | null,
  "quantity_type": "servings",
  "quantity_value": <number>,
  "quantity_unit": "servings",
  "ingredients": [
    { "key": "snake_case_key", "name": "Ingredient name", "amount": "numeric amount as string", "unit": "unit" }
  ],
  "steps": [
    { "title": "Step title (short)", "body": "Detailed step instructions" }
  ],
${coverLine},
  "source_type": "book" | "website" | "family" | "ai_generated" | "personal" | "other" | null,
  "source_name": "Source name (book title, website name, person's name, etc.)" or null,
  "source_url": "https://..." or null
}`;
}

export const RECIPE_FIELD_RULES = `\
- "key" must be a unique snake_case identifier derived from the ingredient name (e.g. "all_purpose_flour", "olive_oil")
- "amount" must be a numeric string (e.g. "200", "1.5") or empty string if unspecified
- "unit" must be one of these exact values: ${
  ALL_UNITS.join(", ")
} — or empty string if no unit applies
- "quantity_type" should be "servings" unless the recipe specifies weight/volume/dimensions
- If prep or cook time is not specified, use null
- "difficulty" should be "easy", "medium", or "hard" based on the recipe's complexity, technique requirements, and skill level needed. Use null if uncertain
- Step titles should be short (2-4 words). Step bodies support Markdown and a template syntax for dynamic ingredient scaling. Only use template refs when an ingredient amount is explicitly mentioned in a step — if a step just names an ingredient without a specific quantity, use plain text.
- Template syntax reference:
${TEMPLATE_DOCS}
- "source_type": Identify the origin of the recipe when possible. Use "book" for cookbook/printed sources, "website" for online sources, "family" for family/friend recipes, "ai_generated" for AI-created recipes, "personal" for original creations, "other" for anything else. Use null only if truly unknown.
- "source_name": The name of the source — book title, website/blog name, person's name, etc. Include as much detail as possible. Use null only if completely unknown.
- "source_url": The URL if the recipe came from a website. Use null otherwise.
- Return ONLY the JSON object, no markdown fences or extra text`;
