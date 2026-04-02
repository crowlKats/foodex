import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import type {
  Ingredient,
  Recipe,
  RecipeIngredient,
  RecipeReference,
  RecipeStep,
  RecipeTag,
  RecipeTool,
  RecipeWithCoverMedia,
  Tool,
} from "../../../db/types.ts";
import { saveRecipeChildren } from "../../../lib/recipe-save.ts";
import QuantityInput from "../../../islands/QuantityInput.tsx";
import IngredientForm from "../../../islands/IngredientForm.tsx";
import ToolForm from "../../../islands/ToolForm.tsx";
import StepForm from "../../../islands/StepForm.tsx";
import MediaUpload from "../../../islands/MediaUpload.tsx";
import RecipePreview from "../../../islands/RecipePreview.tsx";
import MultiSearchSelect from "../../../islands/MultiSearchSelect.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import { FormField } from "../../../components/FormField.tsx";
import { DurationInput } from "../../../components/DurationInput.tsx";
import RecipeOutputForm from "../../../islands/RecipeOutputForm.tsx";
import { RefForm } from "../../../components/RefForm.tsx";
import {
  DIETARY_TAGS,
  DIFFICULTY_LEVELS,
  MEAL_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
} from "../../../lib/recipe-tags.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query<RecipeWithCoverMedia>(
      `SELECT r.*, m.id as cover_media_id, m.url as cover_media_url, m.filename as cover_media_filename, m.content_type as cover_media_content_type
       FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE r.slug = $1`,
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipe = recipeRes.rows[0];

    if (
      !ctx.state.householdId || recipe.household_id !== ctx.state.householdId
    ) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/recipes/${slug}` },
      });
    }

    const ingredientsRes = await ctx.state.db.query<RecipeIngredient>(
      `SELECT ri.*, g.name as ingredient_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const toolsRes = await ctx.state.db.query<RecipeTool>(
      `SELECT rt.*, t.name as tool_name
       FROM recipe_tools rt
       JOIN tools t ON t.id = rt.tool_id
       WHERE rt.recipe_id = $1
       ORDER BY rt.sort_order, rt.id`,
      [recipe.id],
    );

    const stepsRes = await ctx.state.db.query<RecipeStep>(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );

    const stepMediaRes = await ctx.state.db.query<
      { step_id: string; sort_order: number; media_id: string; url: string }
    >(
      `SELECT rsm.step_id, rsm.sort_order, m.id as media_id, m.url
       FROM recipe_step_media rsm
       JOIN media m ON m.id = rsm.media_id
       JOIN recipe_steps rs ON rs.id = rsm.step_id
       WHERE rs.recipe_id = $1
       ORDER BY rsm.step_id, rsm.sort_order`,
      [recipe.id],
    );
    const stepMediaMap = new Map<string, { id: string; url: string }[]>();
    for (const row of stepMediaRes.rows) {
      const stepId = String(row.step_id);
      if (!stepMediaMap.has(stepId)) stepMediaMap.set(stepId, []);
      stepMediaMap.get(stepId)!.push({
        id: String(row.media_id),
        url: String(row.url),
      });
    }

    const refsRes = await ctx.state.db.query<RecipeReference>(
      `SELECT rr.*, r.title as ref_title, r.slug as ref_slug
       FROM recipe_references rr
       JOIN recipes r ON r.id = rr.referenced_recipe_id
       WHERE rr.recipe_id = $1
       ORDER BY rr.sort_order`,
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

    const ingredientsListRes = await ctx.state.db.query<Ingredient>(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );
    const allToolsRes = await ctx.state.db.query<Tool>(
      "SELECT id, name FROM tools ORDER BY name",
    );
    const allRecipesRes = await ctx.state.db.query<Recipe>(
      "SELECT id, title, slug FROM recipes WHERE id != $1 ORDER BY title",
      [recipe.id],
    );

    const stepsWithMedia = stepsRes.rows.map((s) => ({
      ...s,
      media: stepMediaMap.get(String(s.id)) ?? [],
    }));

    let outputIngredientName = "";
    if (recipe.output_ingredient_id) {
      const oRes = await ctx.state.db.query<{ name: string }>(
        "SELECT name FROM ingredients WHERE id = $1",
        [recipe.output_ingredient_id],
      );
      if (oRes.rows.length > 0) outputIngredientName = oRes.rows[0].name;
    }

    ctx.state.pageTitle = `Edit: ${recipe.title}`;
    return page({
      recipe,
      ingredients: ingredientsRes.rows,
      tools: toolsRes.rows,
      steps: stepsWithMedia,
      refs: refsRes.rows,
      mealTypes,
      dietaryTags,
      allIngredients: ingredientsListRes.rows,
      allTools: allToolsRes.rows,
      allRecipes: allRecipesRes.rows,
      outputIngredientName,
    });
  },
  async POST(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query<
      { id: string; household_id: string }
    >(
      "SELECT id, household_id FROM recipes WHERE slug = $1",
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);

    if (
      !ctx.state.householdId ||
      recipeRes.rows[0].household_id !== ctx.state.householdId
    ) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/recipes/${slug}` },
      });
    }

    const recipeId = recipeRes.rows[0].id;

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

    await ctx.state.db.transaction(async (q) => {
      await q(
        `UPDATE recipes SET title=$1, description=$2,
         quantity_type=$3, quantity_value=$4, quantity_unit=$5, quantity_value2=$6, quantity_value3=$7, quantity_unit2=$8,
         prep_time=$9, cook_time=$10, cover_image_id=$11, difficulty=$13, private=$14,
         source_type=$15, source_name=$16, source_url=$17,
         output_ingredient_id=$18, output_amount=$19, output_unit=$20, output_expires_days=$21, updated_at=now()
         WHERE id=$12`,
        [
          title?.trim(),
          description?.trim() || null,
          quantityType,
          quantityValue,
          quantityUnit,
          quantityValue2,
          quantityValue3,
          quantityUnit2,
          prepTime,
          cookTime,
          coverImageId || null,
          recipeId,
          difficulty,
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

      await Promise.all([
        q("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_tools WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_steps WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_references WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_tags WHERE recipe_id = $1", [recipeId]),
      ]);

      await saveRecipeChildren(q, recipeId as string, form);
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}` },
    });
  },
});

export default define.page<typeof handler>(function RecipeEdit({
  data: {
    recipe,
    ingredients,
    tools,
    steps,
    refs,
    mealTypes,
    dietaryTags,
    allIngredients,
    allTools,
    allRecipes,
    outputIngredientName,
  },
}) {
  const ingredientData = ingredients.map((i) => ({
    key: i.key ?? "",
    name: i.name,
    amount: i.amount != null ? String(i.amount) : "",
    unit: i.unit ?? "",
    ingredient_id: i.ingredient_id != null ? String(i.ingredient_id) : "",
  }));

  const toolData = tools.map((m) => ({
    tool_id: String(m.tool_id),
    tool_name: m.tool_name ?? "",
    usage_description: m.usage_description ?? "",
    settings: m.settings ?? "",
  }));

  const stepData = steps.map((s) => ({
    title: s.title ?? "",
    body: s.body ?? "",
    media: s.media ?? [],
  }));

  const refData = refs.map((r) => ({
    referenced_recipe_id: String(r.referenced_recipe_id),
  }));

  return (
    <div>
      <div class="flex items-center gap-4">
        <BackLink href="/recipes" label="Back to Recipes" />
        <a
          href={`/recipes/${recipe.slug}`}
          class="link text-sm"
        >
          View
        </a>
      </div>

      <h1 class="text-2xl font-bold mt-4 mb-6">Edit: {recipe.title}</h1>

      <form method="POST" class="space-y-6">
        <div class="card">
          <h2 class="font-semibold mb-2">Cover Image</h2>
          <MediaUpload
            name="cover_image_id"
            accept="image/*"
            initialMedia={recipe.cover_media_id
              ? [{
                id: String(recipe.cover_media_id),
                url: recipe.cover_media_url!,
                filename: recipe.cover_media_filename!,
                content_type: recipe.cover_media_content_type!,
              }]
              : []}
          />
        </div>

        <div class="card space-y-3">
          <h2 class="font-semibold">Details</h2>
          <FormField label="Title">
            <input
              type="text"
              name="title"
              value={recipe.title}
              required
              class="w-full"
            />
          </FormField>
          <FormField label="Description">
            <textarea
              name="description"
              rows={2}
              class="w-full"
            >
              {recipe.description ?? ""}
            </textarea>
          </FormField>
          <QuantityInput
            initialType={recipe.quantity_type ?? "servings"}
            initialValue={recipe.quantity_value ?? 4}
            initialUnit={recipe.quantity_unit ?? "servings"}
            initialValue2={recipe.quantity_value2 ?? undefined}
            initialValue3={recipe.quantity_value3 ?? undefined}
          />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <DurationInput
              name="prep_time"
              label="Prep time"
              value={recipe.prep_time != null ? String(recipe.prep_time) : ""}
            />
            <DurationInput
              name="cook_time"
              label="Cook time"
              value={recipe.cook_time != null ? String(recipe.cook_time) : ""}
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Difficulty">
              <select name="difficulty" class="w-full">
                <option value="">—</option>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d} value={d} selected={recipe.difficulty === d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Meal Type">
              <MultiSearchSelect
                name="meal_type"
                options={[...MEAL_TYPES]}
                initialSelected={mealTypes}
                placeholder="Search meal types..."
              />
            </FormField>
            <FormField label="Dietary">
              <MultiSearchSelect
                name="dietary"
                options={[...DIETARY_TAGS]}
                initialSelected={dietaryTags}
                placeholder="Search dietary tags..."
              />
            </FormField>
          </div>
          <label class="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              name="private"
              checked={recipe.private}
              class="size-4 accent-orange-600"
            />
            <span class="text-sm">
              Private (only visible to household members)
            </span>
          </label>
          <FormField label="Source">
            <select name="source_type" class="w-full">
              <option value="">—</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s} selected={recipe.source_type === s}>
                  {SOURCE_TYPE_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Source Name">
              <input
                type="text"
                name="source_name"
                value={recipe.source_name ?? ""}
                placeholder="e.g. Book title, website name, person's name"
                class="w-full"
              />
            </FormField>
            <FormField label="Source URL">
              <input
                type="url"
                name="source_url"
                value={recipe.source_url ?? ""}
                placeholder="https://..."
                class="w-full"
              />
            </FormField>
          </div>
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Ingredients</h2>
          <IngredientForm
            initialIngredients={ingredientData}
            ingredients={allIngredients.map((g) => ({
              id: String(g.id),
              name: g.name,
              unit: g.unit ?? "",
            }))}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Tools</h2>
          <ToolForm
            initialTools={toolData}
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
          <StepForm initialSteps={stepData} />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Output Ingredient</h2>
          <RecipeOutputForm
            ingredients={allIngredients.map((g) => ({
              id: String(g.id),
              name: g.name,
              unit: g.unit ?? "",
            }))}
            initialIngredientId={recipe.output_ingredient_id
              ? String(recipe.output_ingredient_id)
              : undefined}
            initialIngredientName={outputIngredientName || undefined}
            initialAmount={recipe.output_amount != null
              ? String(recipe.output_amount)
              : undefined}
            initialUnit={recipe.output_unit ?? undefined}
            initialExpiresDays={recipe.output_expires_days != null
              ? String(recipe.output_expires_days)
              : undefined}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Sub-recipe References</h2>
          <RefForm
            initialRefs={refData}
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
            Save Recipe
          </button>
          <RecipePreview />
        </div>
      </form>

      <form
        action={`/recipes/${recipe.slug}`}
        method="POST"
        class="mt-6 pt-6 border-t-2 border-stone-200 dark:border-stone-700"
      >
        <input type="hidden" name="_method" value="DELETE" />
        <ConfirmButton
          message="Delete this recipe? This cannot be undone."
          class="btn btn-danger"
        >
          Delete Recipe
        </ConfirmButton>
      </form>
    </div>
  );
});
