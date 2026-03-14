import { page } from "fresh";
import { define } from "../../utils.ts";
import type { OcrRecipeData } from "../../lib/ocr.ts";
import QuantityInput from "../../islands/QuantityInput.tsx";
import IngredientForm from "../../islands/IngredientForm.tsx";
import ToolForm from "../../islands/ToolForm.tsx";
import StepForm from "../../islands/StepForm.tsx";
import MediaUpload from "../../islands/MediaUpload.tsx";
import RecipePreview from "../../islands/RecipePreview.tsx";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";
import { DurationInput } from "../../components/DurationInput.tsx";
import OcrUpload from "../../islands/OcrUpload.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const ingredientsRes = await ctx.state.db.query(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );
    const allToolsRes = await ctx.state.db.query(
      "SELECT id, name FROM tools ORDER BY name",
    );
    const allRecipesRes = await ctx.state.db.query(
      "SELECT id, title, slug FROM recipes ORDER BY title",
    );

    return page({
      ingredients: ingredientsRes.rows,
      allTools: allToolsRes.rows,
      allRecipes: allRecipesRes.rows,
      ocr: null,
      coverImage: null,
      error: null,
    });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const ocrJson = form.get("ocr_result") as string | null;
    const coverImageId = form.get("cover_image_id") as string | null;

    const ingredientsRes = await ctx.state.db.query(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );
    const allToolsRes = await ctx.state.db.query(
      "SELECT id, name FROM tools ORDER BY name",
    );
    const allRecipesRes = await ctx.state.db.query(
      "SELECT id, title, slug FROM recipes ORDER BY title",
    );

    const baseData = {
      ingredients: ingredientsRes.rows,
      allTools: allToolsRes.rows,
      allRecipes: allRecipesRes.rows,
    };

    if (!ocrJson) {
      return page({
        ...baseData,
        ocr: null,
        coverImage: null,
        error: "No OCR data received",
      });
    }

    try {
      const ocr = JSON.parse(ocrJson) as OcrRecipeData;

      let coverImage: {
        id: string;
        url: string;
        filename: string;
        content_type: string;
      } | null = null;
      if (coverImageId) {
        const mediaRes = await ctx.state.db.query(
          "SELECT id, url, filename, content_type FROM media WHERE id = $1",
          [parseInt(coverImageId)],
        );
        if (mediaRes.rows.length > 0) {
          const m = mediaRes.rows[0];
          coverImage = {
            id: String(m.id),
            url: String(m.url),
            filename: String(m.filename),
            content_type: String(m.content_type),
          };
        }
      }

      return page({ ...baseData, ocr, coverImage, error: null });
    } catch {
      return page({
        ...baseData,
        ocr: null,
        coverImage: null,
        error: "Invalid OCR data",
      });
    }
  },
});

export default define.page<typeof handler>(function ImportRecipePage({ data }) {
  const { ingredients, allTools, allRecipes, ocr, coverImage, error } =
    data as {
      ingredients: Record<string, unknown>[];
      allTools: Record<string, unknown>[];
      allRecipes: Record<string, unknown>[];
      ocr: OcrRecipeData | null;
      coverImage: {
        id: string;
        url: string;
        filename: string;
        content_type: string;
      } | null;
      error: string | null;
    };

  // Convert OCR prep/cook time from minutes to display values
  let prepTimeValue = "";
  let prepTimeUnit = "min";
  let cookTimeValue = "";
  let cookTimeUnit = "min";
  if (ocr?.prep_time != null) {
    if (ocr.prep_time >= 60 && ocr.prep_time % 60 === 0) {
      prepTimeValue = String(ocr.prep_time / 60);
      prepTimeUnit = "hr";
    } else {
      prepTimeValue = String(ocr.prep_time);
    }
  }
  if (ocr?.cook_time != null) {
    if (ocr.cook_time >= 60 && ocr.cook_time % 60 === 0) {
      cookTimeValue = String(ocr.cook_time / 60);
      cookTimeUnit = "hr";
    } else {
      cookTimeValue = String(ocr.cook_time);
    }
  }

  return (
    <div>
      <div class="flex items-center gap-4 mb-4">
        <BackLink href="/recipes" label="Back to Recipes" />
      </div>

      <h1 class="text-2xl font-bold mb-4">Import Recipe from Image</h1>

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      {!ocr && <OcrUpload />}

      {ocr && (
        <div>
          <div class="card mb-4 p-3">
            <p class="text-sm text-stone-500">
              Recipe extracted from image. Review and edit the fields below,
              then save.
            </p>
          </div>

          <form method="POST" action="/recipes/new" class="space-y-6">
            <div class="card">
              <h2 class="section-title">Cover Image</h2>
              <MediaUpload
                name="cover_image_id"
                accept="image/*"
                initialMedia={coverImage ? [coverImage] : undefined}
              />
            </div>

            <div class="card space-y-3">
              <h2 class="font-semibold">Details</h2>
              <FormField label="Title">
                <input
                  type="text"
                  name="title"
                  required
                  class="w-full"
                  value={ocr.title}
                />
              </FormField>
              <FormField label="Description">
                <textarea
                  name="description"
                  rows={2}
                  class="w-full"
                >
                  {ocr.description}
                </textarea>
              </FormField>
              <QuantityInput
                initialType={ocr.quantity_type}
                initialValue={ocr.quantity_value}
                initialUnit={ocr.quantity_unit}
              />
              <div class="grid grid-cols-2 gap-3 mt-3">
                <DurationInput
                  name="prep_time"
                  label="Prep time"
                  value={prepTimeValue}
                  unit={prepTimeUnit}
                />
                <DurationInput
                  name="cook_time"
                  label="Cook time"
                  value={cookTimeValue}
                  unit={cookTimeUnit}
                />
              </div>
            </div>

            <div class="card">
              <h2 class="font-semibold mb-2">Ingredients</h2>
              <IngredientForm
                initialIngredients={ocr.ingredients.map((ing) => ({
                  ...ing,
                  ingredient_id: "",
                }))}
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
                Use{" "}
                <code class="code-hint">
                  {"{{ key }}"}
                </code>{" "}
                for scaled ingredient output, or{" "}
                <code class="code-hint">
                  {"{{ key.amount }}"}
                </code>{" "}
                for just the number. Available variables:{" "}
                <code class="code-hint">
                  servings
                </code>. Functions:{" "}
                <code class="code-hint">
                  round()
                </code>,{" "}
                <code class="code-hint">
                  ceil()
                </code>,{" "}
                <code class="code-hint">
                  floor()
                </code>. Sub-recipes:{" "}
                <code class="code-hint">
                  @recipe(slug)
                </code>.
              </p>
              <StepForm
                initialSteps={ocr.steps.map((s) => ({ ...s, media: [] }))}
              />
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
              <button type="submit" class="btn btn-primary">
                Create Recipe
              </button>
              <RecipePreview />
              <a href="/recipes/import" class="btn btn-outline">
                Re-import
              </a>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});

function RefForm(
  { initialRefs, recipes }: {
    initialRefs: { referenced_recipe_id: string }[];
    recipes: { id: string; title: string }[];
  },
) {
  return (
    <div>
      {initialRefs.map((ref, i) => (
        <div key={i} class="flex gap-2 mb-2 items-center">
          <select
            name={`refs[${i}][referenced_recipe_id]`}
            class="flex-1"
          >
            <option value="">Select a recipe...</option>
            {recipes.map((r) => (
              <option
                key={r.id}
                value={r.id}
                selected={r.id === ref.referenced_recipe_id}
              >
                {r.title}
              </option>
            ))}
          </select>
        </div>
      ))}
      {initialRefs.length === 0 && (
        <div class="flex gap-2 mb-2 items-center">
          <select
            name="refs[0][referenced_recipe_id]"
            class="flex-1"
          >
            <option value="">Select a recipe...</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <p class="text-xs text-stone-500 mt-2">
        Add more references by saving and re-editing, or use @recipe(slug) in
        the steps.
      </p>
    </div>
  );
}
