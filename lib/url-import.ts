import type { OcrRecipeData } from "./ocr.ts";

/** Schema.org Recipe JSON-LD (partial, fields we care about). */
interface SchemaRecipe {
  "@type": string | string[];
  name?: string;
  description?: string;
  prepTime?: string;
  cookTime?: string;
  recipeYield?: string | string[] | number;
  recipeIngredient?: string[];
  recipeInstructions?:
    | string
    | string[]
    | {
      "@type": string;
      text?: string;
      name?: string;
      itemListElement?: { "@type": string; text?: string }[];
    }[];
  image?: string | string[] | { url?: string };
}

/**
 * Fetch a URL and extract structured recipe data.
 * Handles both schema.org/Recipe JSON-LD on any website and
 * Foodex export endpoints (returns JSON directly).
 */
export async function importRecipeFromUrl(
  url: string,
): Promise<OcrRecipeData> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Foodex/1.0; +https://github.com/foodex)",
      Accept: "text/html, application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // If the response is JSON, check if it's a Foodex export
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (data._format === "foodex/recipe") {
      return {
        title: data.title || "Untitled Recipe",
        description: data.description || "",
        prep_time: data.prep_time ?? null,
        cook_time: data.cook_time ?? null,
        difficulty: data.difficulty ?? null,
        quantity_type: data.quantity_type || "servings",
        quantity_value: data.quantity_value ?? 4,
        quantity_unit: data.quantity_unit || "servings",
        ingredients: data.ingredients || [],
        steps: data.steps || [],
        cover_image: null,
      };
    }
    throw new Error("JSON response is not a recognized recipe format");
  }

  const html = await res.text();
  const recipe = extractJsonLdRecipe(html);
  if (!recipe) {
    throw new Error(
      "No schema.org/Recipe data found on this page",
    );
  }

  return schemaToOcrData(recipe);
}

/** Extract first schema.org/Recipe from JSON-LD script tags in HTML. */
function extractJsonLdRecipe(html: string): SchemaRecipe | null {
  const scriptPattern =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const found = findRecipeInJsonLd(data);
      if (found) return found;
    } catch {
      // Invalid JSON, try next script tag
    }
  }
  return null;
}

function findRecipeInJsonLd(data: unknown): SchemaRecipe | null {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJsonLd(item);
      if (found) return found;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check @type
  const type = obj["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return obj as unknown as SchemaRecipe;
  }

  // Check @graph
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const found = findRecipeInJsonLd(item);
      if (found) return found;
    }
  }

  return null;
}

/** Parse ISO 8601 duration (PT1H30M) to minutes. */
function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const match = iso.match(/^PT?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  return hours * 60 + minutes || null;
}

/** Parse a raw ingredient string into structured parts. */
function parseIngredientString(
  raw: string,
  index: number,
): { key: string; name: string; amount: string; unit: string } {
  const trimmed = raw.trim();

  // Try to extract leading amount and unit: "200 g flour" or "1 1/2 cups sugar"
  const amountPattern =
    /^([\d./½¼¾⅓⅔⅛]+(?:\s*[\d./½¼¾⅓⅔⅛]+)?)\s*(g|kg|ml|l|oz|lb|lbs|cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|ounce|ounces|clove|cloves|bunch|pinch|dash|slice|slices|piece|pieces|can|cans|head|stalk|stalks|sprig|sprigs|handful|stick|sticks)?\s*(?:of\s+)?(.+)/i;
  const m = trimmed.match(amountPattern);

  let amount = "";
  let unit = "";
  let name = trimmed;

  if (m) {
    amount = normalizeFractions(m[1]);
    unit = normalizeUnit(m[2] || "");
    name = m[3];
  }

  // Clean up name
  name = name
    .replace(/,\s*(divided|to taste|optional|for garnish|as needed).*/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();

  const key = toSnakeCase(name) || `ingredient_${index}`;

  return { key, name, amount, unit };
}

function normalizeFractions(s: string): string {
  return s
    .replace("½", "0.5")
    .replace("¼", "0.25")
    .replace("¾", "0.75")
    .replace("⅓", "0.333")
    .replace("⅔", "0.667")
    .replace("⅛", "0.125")
    .replace(
      /(\d+)\s+(\d+)\/(\d+)/g,
      (_m, whole, num, den) =>
        String(parseInt(whole) + parseInt(num) / parseInt(den)),
    )
    .replace(
      /(\d+)\/(\d+)/g,
      (_m, num, den) => String(parseInt(num) / parseInt(den)),
    );
}

const UNIT_MAP: Record<string, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  oz: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  ounce: "oz",
  ounces: "oz",
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  clove: "clove",
  cloves: "clove",
  bunch: "bunch",
  pinch: "pinch",
  dash: "dash",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  can: "can",
  cans: "can",
  head: "head",
  stalk: "stalk",
  stalks: "stalk",
  sprig: "sprig",
  sprigs: "sprig",
  handful: "handful",
  stick: "stick",
  sticks: "stick",
};

function normalizeUnit(raw: string): string {
  if (!raw) return "";
  return UNIT_MAP[raw.toLowerCase()] || "";
}

function toSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

/** Parse recipeInstructions into steps. */
function parseInstructions(
  instructions: SchemaRecipe["recipeInstructions"],
): { title: string; body: string }[] {
  if (!instructions) return [];

  // String: split on newlines
  if (typeof instructions === "string") {
    return instructions
      .split(/\n+/)
      .filter((s) => s.trim())
      .map((s, i) => ({ title: `Step ${i + 1}`, body: s.trim() }));
  }

  // Array of strings
  if (Array.isArray(instructions) && typeof instructions[0] === "string") {
    return (instructions as string[])
      .filter((s) => s.trim())
      .map((s, i) => ({ title: `Step ${i + 1}`, body: s.trim() }));
  }

  // Array of HowToStep / HowToSection objects
  if (Array.isArray(instructions)) {
    const steps: { title: string; body: string }[] = [];
    let stepNum = 1;
    for (
      const item of instructions as {
        "@type": string;
        text?: string;
        name?: string;
        itemListElement?: { "@type": string; text?: string; name?: string }[];
      }[]
    ) {
      if (item["@type"] === "HowToSection" && item.itemListElement) {
        for (const sub of item.itemListElement) {
          steps.push({
            title: sub.name || `Step ${stepNum}`,
            body: sub.text || "",
          });
          stepNum++;
        }
      } else {
        steps.push({
          title: item.name || `Step ${stepNum}`,
          body: item.text || "",
        });
        stepNum++;
      }
    }
    return steps;
  }

  return [];
}

/** Parse recipeYield into a numeric servings value. */
function parseYield(
  recipeYield: string | string[] | number | undefined,
): number {
  if (recipeYield == null) return 4;
  if (typeof recipeYield === "number") return recipeYield;
  const str = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  const m = String(str).match(/(\d+)/);
  return m ? parseInt(m[1]) : 4;
}

/** Convert a schema.org Recipe to our OcrRecipeData format. */
function schemaToOcrData(recipe: SchemaRecipe): OcrRecipeData {
  const usedKeys = new Set<string>();
  const ingredients = (recipe.recipeIngredient || []).map((raw, i) => {
    const parsed = parseIngredientString(raw, i);
    // Deduplicate keys
    let key = parsed.key;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${parsed.key}_${suffix++}`;
    }
    usedKeys.add(key);
    return { ...parsed, key };
  });

  return {
    title: recipe.name || "Untitled Recipe",
    description: recipe.description || "",
    prep_time: parseDuration(recipe.prepTime),
    cook_time: parseDuration(recipe.cookTime),
    difficulty: null,
    quantity_type: "servings",
    quantity_value: parseYield(recipe.recipeYield),
    quantity_unit: "servings",
    ingredients,
    steps: parseInstructions(recipe.recipeInstructions),
    cover_image: null,
  };
}
