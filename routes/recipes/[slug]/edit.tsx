import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import { parseFormArray } from "../../../lib/form.ts";
import QuantityInput from "../../../islands/QuantityInput.tsx";
import IngredientForm from "../../../islands/IngredientForm.tsx";
import ToolForm from "../../../islands/ToolForm.tsx";
import StepForm from "../../../islands/StepForm.tsx";
import MediaUpload from "../../../islands/MediaUpload.tsx";
import RecipePreview from "../../../islands/RecipePreview.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import { FormField } from "../../../components/FormField.tsx";
import { DurationInput } from "../../../components/DurationInput.tsx";
import { RefForm } from "../../../components/RefForm.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query(
      `SELECT r.*, m.id as cover_media_id, m.url as cover_media_url, m.filename as cover_media_filename, m.content_type as cover_media_content_type
       FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE r.slug = $1`,
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipe = recipeRes.rows[0];

    if (!ctx.state.householdId || recipe.household_id !== ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/recipes/${slug}` },
      });
    }

    const ingredientsRes = await ctx.state.db.query(
      `SELECT ri.*, g.name as ingredient_name
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const toolsRes = await ctx.state.db.query(
      `SELECT rt.*, t.name as tool_name
       FROM recipe_tools rt
       JOIN tools t ON t.id = rt.tool_id
       WHERE rt.recipe_id = $1
       ORDER BY rt.sort_order, rt.id`,
      [recipe.id],
    );

    const stepsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );

    const stepMediaRes = await ctx.state.db.query(
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

    const refsRes = await ctx.state.db.query(
      `SELECT rr.*, r.title as ref_title, r.slug as ref_slug
       FROM recipe_references rr
       JOIN recipes r ON r.id = rr.referenced_recipe_id
       WHERE rr.recipe_id = $1
       ORDER BY rr.sort_order`,
      [recipe.id],
    );

    const ingredientsListRes = await ctx.state.db.query(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );
    const allToolsRes = await ctx.state.db.query(
      "SELECT id, name FROM tools WHERE household_id = $1 ORDER BY name",
      [ctx.state.householdId],
    );
    const allRecipesRes = await ctx.state.db.query(
      "SELECT id, title, slug FROM recipes WHERE household_id = $1 AND id != $2 ORDER BY title",
      [ctx.state.householdId, recipe.id],
    );

    const stepsWithMedia = stepsRes.rows.map((s: Record<string, unknown>) => ({
      ...s,
      media: stepMediaMap.get(String(s.id)) ?? [],
    }));

    return page({
      recipe,
      ingredients: ingredientsRes.rows,
      tools: toolsRes.rows,
      steps: stepsWithMedia,
      refs: refsRes.rows,
      allIngredients: ingredientsListRes.rows,
      allTools: allToolsRes.rows,
      allRecipes: allRecipesRes.rows,
    });
  },
  async POST(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query(
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

    await ctx.state.db.query(
      `UPDATE recipes SET title=$1, description=$2,
       quantity_type=$3, quantity_value=$4, quantity_unit=$5, quantity_value2=$6, quantity_value3=$7, quantity_unit2=$8,
       prep_time=$9, cook_time=$10, cover_image_id=$11, updated_at=now()
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
        coverImageId ? parseInt(coverImageId) : null,
        recipeId,
      ],
    );

    await ctx.state.db.query(
      "DELETE FROM recipe_ingredients WHERE recipe_id = $1",
      [recipeId],
    );
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

    await ctx.state.db.query(
      "DELETE FROM recipe_tools WHERE recipe_id = $1",
      [recipeId],
    );
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

    await ctx.state.db.query(
      "DELETE FROM recipe_steps WHERE recipe_id = $1",
      [recipeId],
    );
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

    await ctx.state.db.query(
      "DELETE FROM recipe_references WHERE recipe_id = $1",
      [recipeId],
    );
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

export default define.page<typeof handler>(function RecipeEdit({ data }) {
  const {
    recipe,
    ingredients,
    tools,
    steps,
    refs,
    allIngredients,
    allTools,
    allRecipes,
  } = data as {
    recipe: Record<string, unknown>;
    ingredients: Record<string, unknown>[];
    tools: Record<string, unknown>[];
    steps: Record<string, unknown>[];
    refs: Record<string, unknown>[];
    allIngredients: Record<string, unknown>[];
    allTools: Record<string, unknown>[];
    allRecipes: Record<string, unknown>[];
  };

  const ingredientData = ingredients.map((i) => ({
    key: String(i.key ?? ""),
    name: String(i.name),
    amount: i.amount != null ? String(i.amount) : "",
    unit: String(i.unit ?? ""),
    ingredient_id: i.ingredient_id != null ? String(i.ingredient_id) : "",
  }));

  const toolData = tools.map((m) => ({
    tool_id: String(m.tool_id),
    tool_name: String(m.tool_name ?? ""),
    usage_description: String(m.usage_description ?? ""),
    settings: String(m.settings ?? ""),
  }));

  const stepData = steps.map((s) => ({
    title: String(s.title ?? ""),
    body: String(s.body ?? ""),
    media: (s.media ?? []) as { id: string; url: string }[],
  }));

  const refData = refs.map((r) => ({
    referenced_recipe_id: String(r.referenced_recipe_id),
  }));

  return (
    <div>
      <div class="flex items-center gap-4 mb-4">
        <BackLink href="/recipes" label="Back to Recipes" />
        <a
          href={`/recipes/${recipe.slug}`}
          class="link text-sm"
        >
          View
        </a>
      </div>

      <h1 class="text-2xl font-bold mb-4">Edit: {String(recipe.title)}</h1>

      <form method="POST" class="space-y-6">
        <div class="card">
          <h2 class="section-title">Cover Image</h2>
          <MediaUpload
            name="cover_image_id"
            accept="image/*"
            initialMedia={recipe.cover_media_id
              ? [{
                id: String(recipe.cover_media_id),
                url: String(recipe.cover_media_url),
                filename: String(recipe.cover_media_filename),
                content_type: String(recipe.cover_media_content_type),
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
              value={String(recipe.title)}
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
              {String(recipe.description ?? "")}
            </textarea>
          </FormField>
          <QuantityInput
            initialType={String(recipe.quantity_type ?? "servings")}
            initialValue={Number(recipe.quantity_value ?? 4)}
            initialUnit={String(recipe.quantity_unit ?? "servings")}
            initialValue2={recipe.quantity_value2 != null
              ? Number(recipe.quantity_value2)
              : undefined}
            initialValue3={recipe.quantity_value3 != null
              ? Number(recipe.quantity_value3)
              : undefined}
          />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <DurationInput
              name="prep_time"
              label="Prep time"
              value={String(recipe.prep_time ?? "")}
            />
            <DurationInput
              name="cook_time"
              label="Cook time"
              value={String(recipe.cook_time ?? "")}
            />
          </div>
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Ingredients</h2>
          <IngredientForm
            initialIngredients={ingredientData}
            ingredients={allIngredients.map((g) => ({
              id: String(g.id),
              name: String(g.name),
              unit: String(g.unit ?? ""),
            }))}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Tools</h2>
          <ToolForm
            initialTools={toolData}
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
          <StepForm initialSteps={stepData} />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Sub-recipe References</h2>
          <RefForm
            initialRefs={refData}
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
            Save Recipe
          </button>
          <RecipePreview />
        </div>
      </form>
    </div>
  );
});

