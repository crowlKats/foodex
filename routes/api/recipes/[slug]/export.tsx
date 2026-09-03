import { handler } from "./$export.ts";
import { HttpError } from "fresh/errors";
import type {
  RecipeIngredient,
  RecipeSectionDep,
  RecipeStep,
  RecipeStepDep,
  RecipeStepSection,
  RecipeTag,
} from "../../../../db/types.ts";
import { computeStepAfters } from "../../../../lib/step-graph.ts";

export const handlers = handler({
  async GET(ctx) {
    const slug = ctx.params.slug;

    const recipeRes = await ctx.state.db.query<{
      id: string;
      title: string;
      slug: string;
      description: string;
      prep_time: number | null;
      cook_time: number | null;
      rest_time: number | null;
      difficulty: string | null;
      quantity_type: string;
      quantity_value: number;
      quantity_unit: string;
      quantity_value2: number | null;
      quantity_value3: number | null;
      quantity_unit2: string | null;
      quantity_servings: number | null;
      private: boolean;
      household_id: string;
      cover_image_url: string | null;
      source_type: string | null;
      source_name: string | null;
      source_url: string | null;
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

    const stepDepsRes = await ctx.state.db.query<RecipeStepDep>(
      `SELECT sd.step_id, sd.depends_on
       FROM recipe_step_deps sd
       JOIN recipe_steps rs ON rs.id = sd.step_id
       WHERE rs.recipe_id = $1`,
      [recipe.id],
    );
    const stepAfterMap = computeStepAfters(
      stepsRes.rows.map((s) => s.id),
      stepDepsRes.rows,
    );

    const sectionsRes = await ctx.state.db.query<RecipeStepSection>(
      `SELECT * FROM recipe_step_sections WHERE recipe_id = $1
       ORDER BY sort_order, id`,
      [recipe.id],
    );
    const sectionDepsRes = await ctx.state.db.query<RecipeSectionDep>(
      `SELECT sd.section_id, sd.depends_on
       FROM recipe_section_deps sd
       JOIN recipe_step_sections s ON s.id = sd.section_id
       WHERE s.recipe_id = $1`,
      [recipe.id],
    );
    const sectionKeyById = new Map(
      sectionsRes.rows.map((s) => [s.id, s.key]),
    );
    const sectionAfters = new Map<string, string[]>();
    for (const d of sectionDepsRes.rows) {
      const key = sectionKeyById.get(d.depends_on);
      if (!key) continue;
      const list = sectionAfters.get(d.section_id) ?? [];
      list.push(key);
      sectionAfters.set(d.section_id, list);
    }

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
    const cuisines = tagsRes.rows
      .filter((t) => t.tag_type === "cuisine")
      .map((t) => t.tag_value);

    // Foodex-native export format (superset of OcrRecipeData)
    const exportData = {
      _format: "foodex/recipe",
      _version: 1,
      title: recipe.title,
      description: recipe.description || "",
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      rest_time: recipe.rest_time,
      difficulty: recipe.difficulty,
      quantity_type: recipe.quantity_type || "servings",
      quantity_value: recipe.quantity_value ?? 4,
      quantity_unit: recipe.quantity_unit || "servings",
      quantity_value2: recipe.quantity_value2,
      quantity_value3: recipe.quantity_value3,
      quantity_unit2: recipe.quantity_unit2,
      quantity_servings: recipe.quantity_servings,
      ingredients: ingredientsRes.rows.map((i) => ({
        key: i.key || "",
        name: i.ingredient_name ?? i.name,
        amount: i.amount != null ? String(i.amount) : "",
        unit: i.unit || "",
        note: i.note || "",
        intermediate: i.intermediate ?? false,
      })),
      sections: sectionsRes.rows.map((s) => ({
        key: s.key,
        title: s.title,
        after: sectionAfters.get(s.id) ?? [],
      })),
      steps: stepsRes.rows.map((s) => ({
        title: s.title,
        body: s.body,
        after: stepAfterMap.get(s.id) ?? [],
        section: s.section_id != null
          ? sectionKeyById.get(s.section_id) ?? null
          : null,
      })),
      tags: {
        meal_types: mealTypes,
        dietary: dietaryTags,
        cuisine: cuisines,
      },
      cover_image: null,
      source_type: recipe.source_type,
      source_name: recipe.source_name,
      source_url: recipe.source_url,
    };

    return new Response(JSON.stringify(exportData), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
});
