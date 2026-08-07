import { ALL_UNITS } from "./units.ts";
import { DOCS as TEMPLATE_DOCS } from "../routes/docs/templates.md.tsx";
import { DIETARY_TAGS, MEAL_TYPES } from "./recipe-tags.ts";

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
  "rest_time": <number in minutes or null>,
  "difficulty": "easy" | "medium" | "hard" | null,
  "quantity_type": "servings" | "dimensions",
  "quantity_value": <servings count, or tray width in cm>,
  "quantity_unit": "servings" | "cm",
  "quantity_value2": <tray length in cm (dimensions only), else null>,
  "quantity_value3": <tray depth in cm (dimensions only, optional), else null>,
  "quantity_unit2": <"cm" for dimensions, else null>,
  "quantity_servings": <servings/pieces the tray yields, dimensions only, or null>,
  "ingredients": [
    { "key": "snake_case_key", "name": "Ingredient name", "amount": "numeric amount as string", "unit": "unit" }
  ],
  "sections": [
    { "key": "kebab-case-key", "title": "Section title", "after": ["other-section-key"] }
  ],
  "steps": [
    { "title": "Step title (short)", "body": "Detailed step instructions", "section": "kebab-case-key or null" }
  ],
${coverLine},
  "source_type": "book" | "website" | "family" | "ai_generated" | "personal" | "other" | null,
  "source_name": "Source name (book title, website name, person's name, etc.)" or null,
  "source_url": "https://..." or null,
  "meal_types": [<zero or more of: ${
    MEAL_TYPES.map((m) => `"${m}"`).join(", ")
  }>],
  "dietary_tags": [<zero or more of: ${
    DIETARY_TAGS.map((d) => `"${d}"`).join(", ")
  }>]
}`;
}

export const RECIPE_FIELD_RULES = `\
- "key" must be a unique snake_case identifier derived from the ingredient name (e.g. "all_purpose_flour", "olive_oil")
- ONE row per ingredient. When the source uses the same ingredient in several places (listed per component, or "divided"), merge it into a single row holding the TOTAL amount; never create per-use rows or keys like "butter_for_sauce" / "butter_for_finishing". Write each partial use into the step body with arithmetic on the ref so it still scales: with 60 g of bottarga total, "stir in {{ round(bottarga.amount * 40 / 60) }} g of bottarga" renders the 40 g share.
- "amount" must be a numeric string (e.g. "200", "1.5") or empty string if unspecified
- "unit" must be one of these exact values: ${
  ALL_UNITS.join(", ")
}, or empty string if no unit applies
- "quantity_type" should be "servings" unless the recipe specifies weight/volume/dimensions
- TRAY RECIPES: when the recipe is baked or set in a tray/pan/tin/dish of stated dimensions \
(e.g. "20x30 cm tray", "9x13 inch pan"), use quantity_type "dimensions" with the tray size in \
cm as quantity_value (width) / quantity_value2 (length) / quantity_value3 (depth, if stated); \
the tray is what the recipe scales by. If the source ALSO states a yield in pieces or servings \
("makes 15", "serves 12"), record it in "quantity_servings". Where a step mentions the tray or \
its size, write {{ tray }} instead of the literal dimensions so the text follows the scaled \
tray size.
- If prep, cook, or rest time is not specified, use null. "rest_time" covers any inactive waiting (rising dough, marinating, chilling, resting cooked meat, etc.), not active prep or cook time.
- "difficulty" should be "easy", "medium", or "hard" based on the recipe's complexity, technique requirements, and skill level needed. Use null if uncertain
- Amounts of INTERMEDIATE products (browned butter made from the butter row, reserved cooking water, a dough from an earlier step) are not ingredient refs, but they must still scale: write them as arithmetic on the "ratio" variable, e.g. "add {{ round(50 * ratio) }} g of the browned butter". Never leave a bare number on anything that scales with the recipe.
- Cross-check the numbers: partial uses in step text must add up to the ingredient row's total, and a reserved amount can never exceed the row (a 210 g water row cannot say "reserve 400 g"). When the source is internally inconsistent, fix the numbers to be consistent and keep the proportions sensible.
- Only actionable instructions become steps. Doneness descriptions, texture targets, or closing notes from the source belong in the final step's body or the description, never as their own step (a cook would have nothing to do before pressing "next").
- Add a @timer() wherever a step states a concrete duration, replacing the duration text: "cook for 5 minutes" → "cook for @timer(5m)". Ranges are supported directly: "cook for 4-6 minutes" → "cook for @timer(4-6m)" (renders as "4-6 min", counts down to the lower bound and offers the rest as an extension). Skip vague timing ("a few minutes", "until golden").
- Step titles should be short (2-4 words). Step bodies support Markdown and a template syntax for dynamic ingredient scaling. Only use template refs when an ingredient amount is explicitly mentioned in a step; if a step just names an ingredient without a specific quantity, use plain text.
- State each amount ONCE, in ONE unit. Sources often repeat an amount in a second unit ("40 g (1.41 oz)", "1 cup (240 ml)"); keep only the converted metric amount and drop the duplicate everywhere: ingredient names, description, and step text. Never emit a parenthetical conversion yourself.
- Use plain ASCII punctuation in ALL recipe text (title, description, ingredient names, steps): hyphens instead of em/en dashes, straight quotes, the letter "x" for dimensions (e.g. 23x13 cm), decimal numbers instead of fraction glyphs (0.5, not ½), and the word "about" instead of ≈ or ~. Degree signs (180°C) are fine.
- "sections" is OPTIONAL. Only include sections if the source recipe explicitly groups steps under sub-headings (e.g. "Sponge", "Coating", "Sauce"). If the recipe is one continuous list of steps, omit "sections" or return an empty array, and set every step's "section" to null. Section "key" must be a unique kebab-case identifier derived from the section title (e.g. "butter-sponge", "coating"). When sections are used, each step's "section" field is the matching section key, and steps within a section should appear contiguously in the "steps" array in their natural order.
- Sections form their own dependency graph. A section's "after" array lists keys of other sections that must finish before this one can start. If sections run in parallel (e.g. you make the sauce while the pasta cooks), they share no dependency. If section B is a finishing step after A, then B.after = ["A"]. Use this to capture the cooking flow: most cookbooks describe sections sequentially, but many natural workflows are actually parallel and should be modeled that way.
- Template syntax reference:
${TEMPLATE_DOCS}
- "source_type": Identify the origin of the recipe when possible. Use "book" for cookbook/printed sources, "website" for online sources, "family" for family/friend recipes, "ai_generated" for AI-created recipes, "personal" for original creations, "other" for anything else. Use null only if truly unknown.
- "source_name": The name of the source (book title, website/blog name, person's name, etc.). Include as much detail as possible. Use null only if completely unknown.
- "source_url": The URL if the recipe came from a website. Use null otherwise.
- "meal_types": Tag the recipe with zero or more meal categories from the allowed list (${
  MEAL_TYPES.join(", ")
}). Pick all that apply (e.g. a frittata could be both "breakfast" and "lunch"). Return an empty array if none clearly apply.
- "dietary_tags": Tag the recipe with zero or more dietary attributes from the allowed list (${
  DIETARY_TAGS.join(", ")
}). Only include a tag if the recipe genuinely satisfies it based on its ingredients (e.g. don't mark "vegan" if it contains dairy or eggs; don't mark "gluten-free" if it contains wheat flour). Return an empty array if none clearly apply or you're unsure.
- Return ONLY the JSON object, no markdown fences or extra text`;
