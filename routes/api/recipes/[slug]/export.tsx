import { HttpError } from "fresh";
import { define } from "../../../../utils.ts";
import type {
  RecipeIngredient,
  RecipeStep,
  RecipeTag,
} from "../../../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;

    const recipeRes = await ctx.state.db.query<{
      id: number;
      title: string;
      slug: string;
      description: string;
      prep_time: number | null;
      cook_time: number | null;
      difficulty: string | null;
      quantity_type: string;
      quantity_value: number;
      quantity_unit: string;
      quantity_value2: number | null;
      quantity_value3: number | null;
      quantity_unit2: string | null;
      private: boolean;
      household_id: number;
      cover_image_url: string | null;
    }>(
      `SELECT r.*, m.url as cover_image_url
       FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE r.slug = $1`,
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipe = recipeRes.rows[0];

    if (recipe.private && recipe.household_id !== ctx.state.householdId) {
      throw new HttpError(404);
    }

    const ingredientsRes = await ctx.state.db.query<RecipeIngredient>(
      `SELECT ri.*, g.name as ingredient_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const stepsRes = await ctx.state.db.query<RecipeStep>(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );

    const tagsRes = await ctx.state.db.query<RecipeTag>(
      "SELECT tag_type, tag_value FROM recipe_tags WHERE recipe_id = $1",
      [recipe.id],
    );

    const mealTypes = tagsRes.rows
      .filter((t) => t.tag_type === "meal_type")
      .map((t) => t.tag_value);
    const dietaryTags = tagsRes.rows
      .filter((t) => t.tag_type === "dietary")
      .map((t) => t.tag_value);

    // Foodex-native export format (superset of OcrRecipeData)
    const exportData = {
      _format: "foodex/recipe",
      _version: 1,
      title: recipe.title,
      description: recipe.description || "",
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      difficulty: recipe.difficulty,
      quantity_type: recipe.quantity_type || "servings",
      quantity_value: recipe.quantity_value ?? 4,
      quantity_unit: recipe.quantity_unit || "servings",
      ingredients: ingredientsRes.rows.map((i) => ({
        key: i.key || "",
        name: i.ingredient_name ?? i.name,
        amount: i.amount != null ? String(i.amount) : "",
        unit: i.unit || "",
      })),
      steps: stepsRes.rows.map((s) => ({
        title: s.title,
        body: s.body,
      })),
      tags: {
        meal_types: mealTypes,
        dietary: dietaryTags,
      },
      cover_image: null,
    };

    return new Response(JSON.stringify(exportData), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  },
});
