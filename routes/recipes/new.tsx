import { handler, page } from "./$new.ts";
import { uniqueSlug } from "../../lib/slug.ts";
import { logAudit } from "../../lib/audit.ts";
import type { QueryFn } from "../../db/mod.ts";
import type { Ingredient, Recipe, Tool } from "../../db/types.ts";
import { saveRecipeChildren } from "../../lib/recipe-save.ts";
import RecipeFields from "../../islands/RecipeFields.tsx";
import { BackLink } from "../../components/BackLink.tsx";
import { FormActions } from "../../components/recipe-form/ui.tsx";
import { catalogFor } from "../../lib/i18n/mod.ts";

/** Ingredient/tool pickers plus recipes this household is allowed to see. */
async function loadRecipeFormOptions(query: QueryFn, householdId: string) {
  const [ingredientsRes, allToolsRes, allRecipesRes] = await Promise.all([
    query<Ingredient>(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    ),
    query<Tool>("SELECT id, name FROM tools ORDER BY name"),
    query<Recipe>(
      "SELECT id, title, slug FROM recipes WHERE (private = false OR household_id = $1) ORDER BY title",
      [householdId],
    ),
  ]);
  return {
    ingredients: ingredientsRes.rows,
    allTools: allToolsRes.rows,
    allRecipes: allRecipesRes.rows,
  };
}

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const options = await loadRecipeFormOptions(
      ctx.state.db.query,
      ctx.state.householdId,
    );

    ctx.state.pageTitle = catalogFor(ctx.state.locale).recipes.newTitle();
    return {
      data: {
        ...options,
        error: null as string | null,
      },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const quantityType = (form.get("quantity_type") as string) || "servings";
    const quantityValue = parseFloat(
      form.get("quantity_value") as string,
    ) || 4;
    const quantityUnit = (form.get("quantity_unit") as string) || "servings";
    const quantityValue2Raw = form.get("quantity_value2") as string;
    const quantityValue2 = quantityValue2Raw
      ? parseFloat(quantityValue2Raw)
      : null;
    const quantityValue3Raw = form.get("quantity_value3") as string;
    const quantityValue3 = quantityValue3Raw
      ? parseFloat(quantityValue3Raw)
      : null;
    const quantityUnit2 = (form.get("quantity_unit2") as string) || null;
    const quantityServingsRaw = form.get("quantity_servings") as string;
    const quantityServings = quantityServingsRaw
      ? parseInt(quantityServingsRaw)
      : null;
    const prepTimeRaw = form.get("prep_time") as string;
    const prepTimeUnit = form.get("prep_time_unit") as string;
    const prepTime = prepTimeRaw
      ? Math.round(
        parseFloat(prepTimeRaw) * (prepTimeUnit === "hr" ? 60 : 1),
      )
      : null;
    const cookTimeRaw = form.get("cook_time") as string;
    const cookTimeUnit = form.get("cook_time_unit") as string;
    const cookTime = cookTimeRaw
      ? Math.round(
        parseFloat(cookTimeRaw) * (cookTimeUnit === "hr" ? 60 : 1),
      )
      : null;
    const restTimeRaw = form.get("rest_time") as string;
    const restTimeUnit = form.get("rest_time_unit") as string;
    const restTime = restTimeRaw
      ? Math.round(
        parseFloat(restTimeRaw) * (restTimeUnit === "hr" ? 60 : 1),
      )
      : null;
    const coverImageId = form.get("cover_image_id") as string;
    const difficulty = (form.get("difficulty") as string) || null;
    const isPrivate = form.get("private") === "on";
    const sourceType = (form.get("source_type") as string) || null;
    const sourceName = (form.get("source_name") as string)?.trim() || null;
    const sourceUrl = (form.get("source_url") as string)?.trim() || null;
    const outputIngredientId = (form.get("output_ingredient_id") as string) ||
      null;
    const outputAmountRaw = form.get("output_amount") as string;
    const outputAmount = outputAmountRaw ? parseFloat(outputAmountRaw) : null;
    const outputUnit = (form.get("output_unit") as string) || null;
    const outputExpiresDaysRaw = form.get("output_expires_days") as string;
    const outputExpiresDays = outputExpiresDaysRaw
      ? parseInt(outputExpiresDaysRaw)
      : null;

    if (!title?.trim()) {
      const options = await loadRecipeFormOptions(
        ctx.state.db.query,
        ctx.state.householdId,
      );
      return {
        data: {
          ...options,
          error: "Title is required",
        },
      };
    }

    const slug = await uniqueSlug(ctx.state.db.query, title);

    let recipeId = "";
    try {
      await ctx.state.db.transaction(async (q) => {
        const res = await q<{ id: string }>(
          `INSERT INTO recipes (title, slug, description, quantity_type, quantity_value, quantity_unit, quantity_value2, quantity_value3, quantity_unit2, quantity_servings, prep_time, cook_time, rest_time, cover_image_id, difficulty, household_id, private, source_type, source_name, source_url, output_ingredient_id, output_amount, output_unit, output_expires_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
           RETURNING id`,
          [
            title.trim(),
            slug,
            description?.trim() || null,
            quantityType,
            quantityValue,
            quantityUnit,
            quantityValue2,
            quantityValue3,
            quantityUnit2,
            quantityServings,
            prepTime,
            cookTime,
            restTime,
            coverImageId || null,
            difficulty,
            ctx.state.householdId,
            isPrivate,
            sourceType,
            sourceName,
            sourceUrl,
            outputIngredientId,
            outputAmount,
            outputUnit,
            outputExpiresDays,
          ],
        );
        recipeId = res.rows[0].id;
        await saveRecipeChildren(q, recipeId, form, {
          householdId: ctx.state.householdId,
        });
      });
    } catch (err) {
      if (String(err).includes("unique")) {
        const options = await loadRecipeFormOptions(
          ctx.state.db.query,
          ctx.state.householdId,
        );
        return {
          data: {
            ...options,
            error: `Slug "${slug}" already exists`,
          },
        };
      }
      throw err;
    }

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "recipe.create",
      targetType: "recipe",
      targetId: recipeId,
      targetLabel: title.trim(),
      detail: `slug ${slug}`,
      householdId: ctx.state.householdId,
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}` },
    });
  },
});

export default page(
  function NewRecipePage(
    { data: { ingredients, allTools, allRecipes, error } },
  ) {
    return (
      <div>
        <BackLink href="/recipes" label="Back to Recipes" />

        <form method="POST" class="space-y-6 mt-4 pb-16">
          <FormActions title="New Recipe" submitLabel="Create Recipe" />
          <p class="text-sm -mt-4">
            <a href="/recipes/import" class="link">
              …or import from URL, text or photos
            </a>
          </p>

          {error && <div class="alert-error">{error}</div>}

          <RecipeFields
            r={{ ingredients: [], steps: [] }}
            ingredients={ingredients.map((g) => ({
              id: String(g.id),
              name: g.name,
              unit: g.unit ?? "",
            }))}
            allTools={allTools.map((m) => ({
              id: String(m.id),
              name: m.name,
            }))}
            allRecipes={allRecipes.map((r) => ({
              id: String(r.id),
              title: r.title,
            }))}
          />
        </form>
      </div>
    );
  },
);
