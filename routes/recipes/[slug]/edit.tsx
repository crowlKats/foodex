import { handler, page } from "./$edit.ts";
import { HttpError } from "fresh/errors";
import { uniqueSlug } from "../../../lib/slug.ts";
import { saveRecipeChildren } from "../../../lib/recipe-save.ts";
import { loadRecipeEditData } from "../../../lib/recipe-edit-data.ts";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import TabValidation from "../../../islands/TabValidation.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import { FormActions, SubGroup } from "../../../components/recipe-form/ui.tsx";
import {
  ClassificationFields,
  CoverField,
  IdentityFields,
  IngredientsField,
  OutputField,
  RefsField,
  SourceFields,
  StepsField,
  ToolsField,
  YieldTimingFields,
} from "../../../components/recipe-form/fields.tsx";
export const handlers = handler({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const data = await loadRecipeEditData(
      ctx.state.db.query,
      slug,
      ctx.state.householdId ?? null,
    );
    if (!data) throw new HttpError(404);

    if (
      !ctx.state.householdId ||
      data.recipe.household_id !== ctx.state.householdId
    ) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/recipes/${slug}` },
      });
    }

    ctx.state.pageTitle = `Edit: ${data.recipe.title}`;
    return { data };
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
    // A manual pin needs a chosen dish; anything else clears the assignment
    // so the dish trigger re-derives it from the (possibly new) title.
    const dishIdRaw = (form.get("dish_id") as string) || null;
    const dishManual = form.get("dish_manual") === "true" && dishIdRaw != null;
    const dishId = dishManual ? dishIdRaw : null;

    let newSlug = slug;
    await ctx.state.db.transaction(async (q) => {
      newSlug = await uniqueSlug(q, title?.trim() || "", recipeId as string);

      await q(
        `UPDATE recipes SET title=$1, slug=$23, description=$2,
         quantity_type=$3, quantity_value=$4, quantity_unit=$5, quantity_value2=$6, quantity_value3=$7, quantity_unit2=$8,
         prep_time=$9, cook_time=$10, rest_time=$22, cover_image_id=$11, difficulty=$13, private=$14,
         source_type=$15, source_name=$16, source_url=$17,
         output_ingredient_id=$18, output_amount=$19, output_unit=$20, output_expires_days=$21,
         dish_id=$24, dish_manual=$25, updated_at=now()
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
          restTime,
          newSlug,
          dishId,
          dishManual,
        ],
      );

      // recipe_step_deps cascade-deletes via recipe_steps FK;
      // recipe_section_deps cascade-deletes via recipe_step_sections FK
      await Promise.all([
        q("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_tools WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_steps WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_step_sections WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_references WHERE recipe_id = $1", [recipeId]),
        q("DELETE FROM recipe_tags WHERE recipe_id = $1", [recipeId]),
      ]);

      await saveRecipeChildren(q, recipeId as string, form);
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${newSlug}` },
    });
  },
});

const TABS = [
  { id: "basics", label: "Basics" },
  { id: "ingredients", label: "Ingredients" },
  { id: "steps", label: "Steps" },
  { id: "advanced", label: "Advanced" },
] as const;

export default page(function RecipeEdit({ data }) {
  const d = data;
  const slug = d.recipe.slug;

  return (
    <div>
      {
        /* Up one level, to the recipe this is editing — which carries its own
          link back to the list. */
      }
      <BackLink href={`/recipes/${slug}`} label="Back to Recipe" />

      {
        /*
        Tabs are radio inputs driving sibling selectors, so every panel stays
        in the DOM and this single submit still posts the whole recipe. The
        `_tab` radio itself is an extra form field the POST handler never
        reads. <TabValidation> covers the flip side: a `required` field on an
        unselected tab would otherwise block submit invisibly.
      */
      }
      <form id="recipe-edit-form" method="POST" class="space-y-6">
        <TabValidation formId="recipe-edit-form" />
        <FormActions title={`Edit: ${d.recipe.title}`} />

        <div class="edit-tabs">
          {TABS.map((t, i) => (
            <input
              key={t.id}
              type="radio"
              name="_tab"
              id={`tab-${t.id}`}
              class="edit-tab-radio"
              checked={i === 0}
            />
          ))}

          <div class="edit-tablist">
            {TABS.map((t) => (
              <label key={t.id} for={`tab-${t.id}`} class="edit-tab">
                {t.label}
                {t.id === "ingredients" && (
                  <span class="count-badge">{d.ingredients.length}</span>
                )}
                {t.id === "steps" && (
                  <span class="count-badge">{d.steps.length}</span>
                )}
              </label>
            ))}
          </div>

          {
            /*
            No card around these three: the tab already draws the boundary,
            and their heading would only repeat the tab's own label. Advanced
            keeps its cards because it holds four distinct sections that need
            separating from each other.
          */
          }
          <div
            data-tab-panel="basics"
            class="edit-panel edit-panel-basics space-y-3"
          >
            <IdentityFields d={d} />
            <SubGroup label="Yield & timing">
              <YieldTimingFields d={d} />
            </SubGroup>
            <SubGroup label="Classification">
              <ClassificationFields d={d} />
            </SubGroup>
            <SubGroup label="Source">
              <SourceFields d={d} />
            </SubGroup>
          </div>

          <div
            data-tab-panel="ingredients"
            class="edit-panel edit-panel-ingredients"
          >
            <IngredientsField d={d} />
          </div>

          <div data-tab-panel="steps" class="edit-panel edit-panel-steps">
            <StepsField d={d} />
          </div>

          <div
            data-tab-panel="advanced"
            class="edit-panel edit-panel-advanced space-y-3"
          >
            <SubGroup label="Cover image">
              <CoverField d={d} />
            </SubGroup>
            <SubGroup label="Tools">
              <ToolsField d={d} />
            </SubGroup>
            <SubGroup label="Output ingredient">
              <OutputField d={d} />
            </SubGroup>
            <SubGroup label="Sub-recipe references">
              <RefsField d={d} />
            </SubGroup>
            <SubGroup label="Danger zone">
              <p class="text-xs text-stone-500 dark:text-stone-400 mb-2">
                Deleting removes the recipe and its steps for everyone in the
                household. This cannot be undone.
              </p>
              {/* Targets the sibling form below — forms can't nest. */}
              <ConfirmButton
                form="delete-recipe-form"
                message="Delete this recipe? This cannot be undone."
                variant="danger"
              >
                Delete Recipe
              </ConfirmButton>
            </SubGroup>
          </div>
        </div>
      </form>

      <form
        id="delete-recipe-form"
        action={`/recipes/${slug}`}
        method="POST"
        class="hidden"
      >
        <input type="hidden" name="_method" value="DELETE" />
      </form>
    </div>
  );
});
