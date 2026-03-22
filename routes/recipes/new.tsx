import { page } from "fresh";
import { define } from "../../utils.ts";
import type { Ingredient, Recipe, Tool } from "../../db/types.ts";
import { saveRecipeChildren } from "../../lib/recipe-save.ts";
import QuantityInput from "../../islands/QuantityInput.tsx";
import IngredientForm from "../../islands/IngredientForm.tsx";
import ToolForm from "../../islands/ToolForm.tsx";
import StepForm from "../../islands/StepForm.tsx";
import MediaUpload from "../../islands/MediaUpload.tsx";
import RecipePreview from "../../islands/RecipePreview.tsx";
import MultiSearchSelect from "../../islands/MultiSearchSelect.tsx";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";
import { DurationInput } from "../../components/DurationInput.tsx";
import { RefForm } from "../../components/RefForm.tsx";
import {
  DIETARY_TAGS,
  DIFFICULTY_LEVELS,
  MEAL_TYPES,
} from "../../lib/recipe-tags.ts";

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

    const ingredientsRes = await ctx.state.db.query<Ingredient>(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );
    const allToolsRes = await ctx.state.db.query<Tool>(
      "SELECT id, name FROM tools ORDER BY name",
    );
    const allRecipesRes = await ctx.state.db.query<Recipe>(
      "SELECT id, title, slug FROM recipes ORDER BY title",
    );

    ctx.state.pageTitle = "New Recipe";
    return {
      data: {
        ingredients: ingredientsRes.rows,
        allTools: allToolsRes.rows,
        allRecipes: allRecipesRes.rows,
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
    const difficulty = (form.get("difficulty") as string) || null;
    const isPrivate = form.get("private") === "on";

    if (!title?.trim()) {
      const ingredientsRes = await ctx.state.db.query<Ingredient>(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      );
      const allToolsRes = await ctx.state.db.query<Tool>(
        "SELECT id, name FROM tools ORDER BY name",
      );
      const allRecipesRes = await ctx.state.db.query<Recipe>(
        "SELECT id, title, slug FROM recipes ORDER BY title",
      );
      return page({
        ingredients: ingredientsRes.rows,
        allTools: allToolsRes.rows,
        allRecipes: allRecipesRes.rows,
        error: "Title is required",
      });
    }

    try {
      await ctx.state.db.transaction(async (q) => {
        const res = await q<{ id: number }>(
          `INSERT INTO recipes (title, slug, description, quantity_type, quantity_value, quantity_unit, quantity_value2, quantity_value3, quantity_unit2, prep_time, cook_time, cover_image_id, difficulty, household_id, private)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
            difficulty,
            ctx.state.householdId,
            isPrivate,
          ],
        );
        await saveRecipeChildren(q, res.rows[0].id, form);

        // Delete draft if this was created from one
        const draftId = form.get("draft_id") as string;
        if (draftId) {
          await q(
            "DELETE FROM recipe_drafts WHERE id = $1 AND household_id = $2",
            [draftId, ctx.state.householdId],
          );
        }
      });
    } catch (err) {
      if (String(err).includes("unique")) {
        const [ingredientsRes, allToolsRes, allRecipesRes] = await Promise.all([
          ctx.state.db.query<Ingredient>(
            "SELECT id, name, unit FROM ingredients ORDER BY name",
          ),
          ctx.state.db.query<Tool>("SELECT id, name FROM tools ORDER BY name"),
          ctx.state.db.query<Recipe>(
            "SELECT id, title, slug FROM recipes ORDER BY title",
          ),
        ]);
        return page({
          ingredients: ingredientsRes.rows,
          allTools: allToolsRes.rows,
          allRecipes: allRecipesRes.rows,
          error: `Slug "${slug}" already exists`,
        });
      }
      throw err;
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}` },
    });
  },
});

export default define.page<typeof handler>(
  function NewRecipePage(
    { data: { ingredients, allTools, allRecipes } },
  ) {
    return (
      <div>
        <BackLink href="/recipes" label="Back to Recipes" />

        <div class="flex items-center gap-4 mt-4 mb-6">
          <h1 class="text-2xl font-bold">New Recipe</h1>
          <a href="/recipes/import" class="link text-sm">
            or import from image
          </a>
        </div>

        <form method="POST" class="space-y-6">
          <div class="card">
            <h2 class="font-semibold mb-2">Cover Image</h2>
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
            <FormField label="Difficulty">
              <select name="difficulty" class="w-full">
                <option value="">—</option>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d} value={d} class="capitalize">
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
            <label class="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                name="private"
                class="size-4 accent-orange-600"
              />
              <span class="text-sm">
                Private (only visible to household members)
              </span>
            </label>
            <FormField label="Meal Type">
              <MultiSearchSelect
                name="meal_type"
                options={[...MEAL_TYPES]}
                placeholder="Search meal types..."
              />
            </FormField>
            <FormField label="Dietary">
              <MultiSearchSelect
                name="dietary"
                options={[...DIETARY_TAGS]}
                placeholder="Search dietary tags..."
              />
            </FormField>
          </div>

          <div class="card">
            <h2 class="font-semibold mb-2">Ingredients</h2>
            <IngredientForm
              initialIngredients={[]}
              ingredients={ingredients.map((g) => ({
                id: String(g.id),
                name: g.name,
                unit: g.unit ?? "",
              }))}
            />
          </div>

          <div class="card">
            <h2 class="font-semibold mb-2">Tools</h2>
            <ToolForm
              initialTools={[]}
              tools={allTools.map((m) => ({
                id: String(m.id),
                name: m.name,
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
                title: r.title,
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
  },
);
