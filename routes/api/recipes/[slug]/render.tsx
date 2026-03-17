import { define } from "../../../../utils.ts";
import { renderRecipeSteps } from "../../../../lib/markdown.ts";
import { scaleIngredients } from "../../../../lib/template.ts";
import { computeScaleRatio } from "../../../../lib/quantity.ts";
import type { RecipeQuantity } from "../../../../lib/quantity.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;

    const recipeRes = await ctx.state.db.query(
      "SELECT id, quantity_type, quantity_value, quantity_unit, quantity_value2, quantity_value3, quantity_unit2 FROM recipes WHERE slug = $1",
      [slug],
    );
    if (recipeRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const recipe = recipeRes.rows[0];

    const baseQuantity: RecipeQuantity = {
      type: String(
        recipe.quantity_type || "servings",
      ) as RecipeQuantity["type"],
      value: Number(recipe.quantity_value ?? 4),
      unit: String(recipe.quantity_unit || "servings"),
      value2: recipe.quantity_value2 != null
        ? Number(recipe.quantity_value2)
        : undefined,
      value3: recipe.quantity_value3 != null
        ? Number(recipe.quantity_value3)
        : undefined,
      unit2: recipe.quantity_unit2 ? String(recipe.quantity_unit2) : undefined,
    };

    const params = ctx.url.searchParams;
    let targetQuantity: RecipeQuantity;

    if (params.has("type") && params.has("value")) {
      targetQuantity = {
        type: String(params.get("type")) as RecipeQuantity["type"],
        value: Number(params.get("value")),
        unit: String(params.get("unit") || baseQuantity.unit),
        value2: params.has("value2") ? Number(params.get("value2")) : undefined,
        value3: params.has("value3") ? Number(params.get("value3")) : undefined,
        unit2: params.has("unit2") ? String(params.get("unit2")) : undefined,
      };
    } else if (params.has("servings")) {
      targetQuantity = {
        type: "servings",
        value: Number(params.get("servings")) || 4,
        unit: "servings",
      };
    } else {
      targetQuantity = { ...baseQuantity };
    }

    const ratio = computeScaleRatio(baseQuantity, targetQuantity);

    const stepsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );

    const ingredientsRes = await ctx.state.db.query(
      `SELECT ri.*, g.name as ingredient_name, g.unit as ingredient_unit
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const ingredientsForTemplate = ingredientsRes.rows
      .filter((i) => i.key && i.amount != null)
      .map((i) => ({
        key: String(i.key),
        amount: Number(i.amount),
        unit: String(i.unit ?? ""),
        name: String(i.name),
      }));

    const scaledIngredients = scaleIngredients(
      ingredientsForTemplate,
      ratio,
    );

    const steps = stepsRes.rows.map((s) => ({
      title: String(s.title),
      body: String(s.body),
    }));

    const html = await renderRecipeSteps(
      steps,
      { ratio },
      scaledIngredients,
      async (refSlug) => {
        const res = await ctx.state.db.query(
          "SELECT title, slug FROM recipes WHERE slug = $1",
          [refSlug],
        );
        if (res.rows.length === 0) return null;
        return {
          title: String(res.rows[0].title),
          slug: String(res.rows[0].slug),
        };
      },
    );

    return new Response(JSON.stringify({ html }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
