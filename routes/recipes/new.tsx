import { page } from "fresh";
import { define } from "../../utils.ts";
import { parseFormArray } from "../../lib/form.ts";
import QuantityInput from "../../islands/QuantityInput.tsx";
import IngredientForm from "../../islands/IngredientForm.tsx";
import ToolForm from "../../islands/ToolForm.tsx";
import StepForm from "../../islands/StepForm.tsx";
import MediaUpload from "../../islands/MediaUpload.tsx";
import RecipePreview from "../../islands/RecipePreview.tsx";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";
import { DurationInput } from "../../components/DurationInput.tsx";
import { RefForm } from "../../components/RefForm.tsx";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const ingredientsRes = await ctx.state.db.query(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );
    const allToolsRes = await ctx.state.db.query(
      "SELECT id, name FROM tools WHERE household_id = $1 ORDER BY name",
      [ctx.state.householdId],
    );
    const allRecipesRes = await ctx.state.db.query(
      "SELECT id, title, slug FROM recipes WHERE household_id = $1 ORDER BY title",
      [ctx.state.householdId],
    );

    return page({
      ingredients: ingredientsRes.rows,
      allTools: allToolsRes.rows,
      allRecipes: allRecipesRes.rows,
    });
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
    const slug = slugify(title || "");
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
    const coverImageId = form.get("cover_image_id") as string;

    if (!title?.trim()) {
      const ingredientsRes = await ctx.state.db.query(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      );
      const allToolsRes = await ctx.state.db.query(
        "SELECT id, name FROM tools WHERE household_id = $1 ORDER BY name",
        [ctx.state.householdId],
      );
      const allRecipesRes = await ctx.state.db.query(
        "SELECT id, title, slug FROM recipes WHERE household_id = $1 ORDER BY title",
        [ctx.state.householdId],
      );
      return page({
        ingredients: ingredientsRes.rows,
        allTools: allToolsRes.rows,
        allRecipes: allRecipesRes.rows,
        error: "Title is required",
      });
    }

    let recipeId: number;
    try {
      const res = await ctx.state.db.query(
        `INSERT INTO recipes (title, slug, description, quantity_type, quantity_value, quantity_unit, quantity_value2, quantity_value3, quantity_unit2, prep_time, cook_time, cover_image_id, household_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          prepTime,
          cookTime,
          coverImageId ? parseInt(coverImageId) : null,
          ctx.state.householdId,
        ],
      );
      recipeId = res.rows[0].id as number;
    } catch (err) {
      if (String(err).includes("unique")) {
        const ingredientsRes = await ctx.state.db.query(
          "SELECT id, name, unit FROM ingredients ORDER BY name",
        );
        const allToolsRes = await ctx.state.db.query(
          "SELECT id, name FROM tools WHERE household_id = $1 ORDER BY name",
          [ctx.state.householdId],
        );
        const allRecipesRes = await ctx.state.db.query(
          "SELECT id, title, slug FROM recipes WHERE household_id = $1 ORDER BY title",
          [ctx.state.householdId],
        );
        return page({
          ingredients: ingredientsRes.rows,
          allTools: allToolsRes.rows,
          allRecipes: allRecipesRes.rows,
          error: `Slug "${slug}" already exists`,
        });
      }
      throw err;
    }

    const ingredients = parseFormArray(form, "ingredients");
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.name?.trim()) continue;
      const ingredientId = ing.ingredient_id ? parseInt(ing.ingredient_id) : null;
      await ctx.state.db.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, key, name, amount, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          recipeId,
          ingredientId,
          ing.key?.trim() || null,
          ing.name.trim(),
          ing.amount ? parseFloat(ing.amount) : null,
          ing.unit?.trim() || null,
          i,
        ],
      );
    }

    const toolEntries = parseFormArray(form, "tools");
    for (let i = 0; i < toolEntries.length; i++) {
      const t = toolEntries[i];
      if (!t.tool_id) continue;
      await ctx.state.db.query(
        `INSERT INTO recipe_tools (recipe_id, tool_id, usage_description, settings, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          recipeId,
          parseInt(t.tool_id),
          t.usage_description?.trim() || null,
          t.settings?.trim() || null,
          i,
        ],
      );
    }

    const steps = parseFormArray(form, "steps");
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.title?.trim() && !step.body?.trim()) continue;
      const stepRes = await ctx.state.db.query(
        `INSERT INTO recipe_steps (recipe_id, title, body, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [
          recipeId,
          step.title?.trim() || "",
          step.body?.trim() || "",
          i,
        ],
      );
      const stepId = stepRes.rows[0].id;
      let mi = 0;
      while (form.has(`steps[${i}][media][${mi}]`)) {
        const mediaId = form.get(`steps[${i}][media][${mi}]`) as string;
        if (mediaId) {
          await ctx.state.db.query(
            `INSERT INTO recipe_step_media (step_id, media_id, sort_order)
             VALUES ($1, $2, $3)`,
            [stepId, parseInt(mediaId), mi],
          );
        }
        mi++;
      }
    }

    const refEntries = parseFormArray(form, "refs");
    for (let i = 0; i < refEntries.length; i++) {
      const ref = refEntries[i];
      if (!ref.referenced_recipe_id) continue;
      await ctx.state.db.query(
        `INSERT INTO recipe_references (recipe_id, referenced_recipe_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [recipeId, parseInt(ref.referenced_recipe_id), i],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}` },
    });
  },
});

export default define.page<typeof handler>(function NewRecipePage({ data }) {
  const { ingredients, allTools, allRecipes, error } = data as {
    ingredients: Record<string, unknown>[];
    allTools: Record<string, unknown>[];
    allRecipes: Record<string, unknown>[];
    error?: string;
  };

  return (
    <div>
      <div class="flex items-center gap-4 mb-4">
        <BackLink href="/recipes" label="Back to Recipes" />
      </div>

      <div class="flex items-center gap-4 mb-4">
        <h1 class="text-2xl font-bold">New Recipe</h1>
        <a href="/recipes/import" class="link text-sm">
          or import from image
        </a>
      </div>

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      <form method="POST" class="space-y-6">
        <div class="card">
          <h2 class="section-title">Cover Image</h2>
          <MediaUpload name="cover_image_id" accept="image/*" />
        </div>

        <div class="card space-y-3">
          <h2 class="font-semibold">Details</h2>
          <FormField label="Title">
            <input
              type="text"
              name="title"
              required
              class="w-full"
            />
          </FormField>
          <FormField label="Description">
            <textarea
              name="description"
              rows={2}
              class="w-full"
            />
          </FormField>
          <QuantityInput />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <DurationInput name="prep_time" label="Prep time" />
            <DurationInput name="cook_time" label="Cook time" />
          </div>
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Ingredients</h2>
          <IngredientForm
            initialIngredients={[]}
            ingredients={ingredients.map((g) => ({
              id: String(g.id),
              name: String(g.name),
              unit: String(g.unit ?? ""),
            }))}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Tools</h2>
          <ToolForm
            initialTools={[]}
            tools={allTools.map((m) => ({
              id: String(m.id),
              name: String(m.name),
            }))}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Steps</h2>
          <p class="text-xs text-stone-500 mb-2">
            Use <code class="code-hint">{"{{ key }}"}</code>{" "}
            for scaled ingredients,{" "}
            <code class="code-hint">{"{{ key.amount }}"}</code>{" "}
            for just the number. Supports math and functions.{" "}
            <a href="/docs/templates" class="link text-xs">Full reference</a>
          </p>
          <StepForm initialSteps={[]} />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Sub-recipe References</h2>
          <RefForm
            initialRefs={[]}
            recipes={allRecipes.map((r) => ({
              id: String(r.id),
              title: String(r.title),
            }))}
          />
        </div>

        <div class="flex gap-3">
          <button
            type="submit"
            class="btn btn-primary"
          >
            Create Recipe
          </button>
          <RecipePreview />
        </div>
      </form>
    </div>
  );
});

