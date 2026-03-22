import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import type {
  RecipeIngredient,
  RecipeReference,
  RecipeStep,
  RecipeTag,
  RecipeTool,
  RecipeWithCover,
} from "../../../db/types.ts";
import { renderRecipeSteps } from "../../../lib/markdown.ts";
import { formatDuration } from "../../../lib/duration.ts";
import { scaleIngredients } from "../../../lib/template.ts";
import { computeIngredientCost } from "../../../lib/unit-convert.ts";
import { formatQuantity } from "../../../lib/quantity.ts";
import type { RecipeQuantity } from "../../../lib/quantity.ts";
import RecipeView from "../../../islands/RecipeView.tsx";
import ImageLightbox from "../../../islands/ImageLightbox.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import FavoriteButton from "../../../islands/FavoriteButton.tsx";
import TbEdit from "tb-icons/TbEdit";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query<RecipeWithCover>(
      `SELECT r.*, m.url as cover_image_url
       FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE r.slug = $1`,
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipe = recipeRes.rows[0];

    // Block access to private recipes from non-members
    if (recipe.private && recipe.household_id !== ctx.state.householdId) {
      throw new HttpError(404);
    }

    const ingredientsRes = await ctx.state.db.query<
      RecipeIngredient & { density: number | null }
    >(
      `SELECT ri.*, g.name as ingredient_name, g.unit as ingredient_unit, g.density
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const toolsRes = await ctx.state.db.query<RecipeTool>(
      `SELECT rt.*, t.name as tool_name, t.description as tool_description
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
      { step_id: number; media_id: number; url: string }
    >(
      `SELECT rsm.step_id, m.id as media_id, m.url
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
       ORDER BY rr.sort_order, rr.id`,
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

    const baseQuantity: RecipeQuantity = {
      type: (recipe.quantity_type || "servings") as RecipeQuantity["type"],
      value: recipe.quantity_value ?? 4,
      unit: recipe.quantity_unit || "servings",
      value2: recipe.quantity_value2 ?? undefined,
      value3: recipe.quantity_value3 ?? undefined,
      unit2: recipe.quantity_unit2 ?? undefined,
    };

    const ingredientIds = ingredientsRes.rows
      .filter((i) => i.ingredient_id != null)
      .map((i) => i.ingredient_id!);

    const priceMap = new Map<
      number,
      {
        price: number;
        amount: number;
        priceUnit: string;
        currency: string;
        density: number | null;
      }
    >();
    if (ingredientIds.length > 0) {
      const pricesRes = await ctx.state.db.query<{
        ingredient_id: number;
        price: number;
        amount: number;
        price_unit: string | null;
        currency: string;
        density: number | null;
      }>(
        `SELECT DISTINCT ON (gp.ingredient_id)
           gp.ingredient_id, gp.price, gp.amount, coalesce(gp.unit, g.unit) as price_unit, s.currency, g.density
         FROM ingredient_prices gp
         JOIN stores s ON s.id = gp.store_id
         JOIN ingredients g ON g.id = gp.ingredient_id
         WHERE gp.ingredient_id = ANY($1)
         ORDER BY gp.ingredient_id, gp.price ASC`,
        [ingredientIds],
      );
      for (const row of pricesRes.rows) {
        priceMap.set(row.ingredient_id, {
          price: row.price,
          amount: row.amount || 1,
          priceUnit: row.price_unit ?? "",
          currency: row.currency ?? "EUR",
          density: row.density,
        });
      }
    }

    const ingredientsForTemplate = ingredientsRes.rows
      .filter((i) => i.key && i.amount != null)
      .map((i) => {
        const ingredientId = i.ingredient_id ?? undefined;
        const priceInfo = ingredientId ? priceMap.get(ingredientId) : undefined;
        const ingAmount = i.amount!;
        const ingUnit = i.unit ?? "";
        const baseCost = priceInfo
          ? computeIngredientCost(
            ingAmount,
            ingUnit,
            priceInfo.price,
            priceInfo.amount,
            priceInfo.priceUnit,
            priceInfo.density,
          )
          : undefined;
        return {
          key: i.key!,
          amount: ingAmount,
          unit: ingUnit,
          name: i.ingredient_name ?? i.name,
          ingredient_id: ingredientId,
          base_cost: baseCost ?? undefined,
          currency: priceInfo?.currency,
          density: i.density,
        };
      });

    const scaledIngredients = scaleIngredients(
      ingredientsForTemplate,
      1,
    );

    const hasSubRecipes = stepsRes.rows.some((s) =>
      /@recipe\([a-z0-9_-]+\)/.test(s.body)
    );

    const stepsData = stepsRes.rows.map((s) => ({
      title: s.title,
      body: s.body,
      media: stepMediaMap.get(String(s.id)) ?? [],
    }));

    const renderedHtml = await renderRecipeSteps(
      stepsData,
      { ratio: 1 },
      scaledIngredients,
      async (refSlug) => {
        const res = await ctx.state.db.query<{ title: string; slug: string }>(
          "SELECT title, slug FROM recipes WHERE slug = $1",
          [refSlug],
        );
        if (res.rows.length === 0) return null;
        return {
          title: res.rows[0].title,
          slug: res.rows[0].slug,
        };
      },
    );

    const isOwner = ctx.state.householdId != null &&
      recipe.household_id === ctx.state.householdId;

    // Load pantry items from user's household
    let pantryItems: {
      ingredient_id?: number;
      name: string;
      amount?: number;
      unit?: string;
    }[] = [];
    if (ctx.state.householdId) {
      const pantryRes = await ctx.state.db.query<{
        ingredient_id: number | null;
        name: string;
        amount: number | null;
        unit: string | null;
      }>(
        `SELECT pi.ingredient_id, lower(pi.name) as name, pi.amount, pi.unit
         FROM pantry_items pi
         WHERE pi.household_id = $1`,
        [ctx.state.householdId],
      );
      pantryItems = pantryRes.rows.map((r) => ({
        ingredient_id: r.ingredient_id ?? undefined,
        name: r.name,
        amount: r.amount ?? undefined,
        unit: r.unit ?? undefined,
      }));
    }
    const pantryIngredientIds = pantryItems
      .filter((r) => r.ingredient_id != null)
      .map((r) => r.ingredient_id!);
    const pantryIngredientNames = pantryItems.map((r) => r.name);

    let isFavorited = false;
    if (ctx.state.user) {
      const favRes = await ctx.state.db.query(
        "SELECT 1 FROM recipe_favorites WHERE user_id = $1 AND recipe_id = $2",
        [ctx.state.user.id, recipe.id],
      );
      isFavorited = favRes.rows.length > 0;
    }

    ctx.state.pageTitle = recipe.title;
    return page({
      recipe,
      ingredientsForTemplate,
      tools: toolsRes.rows,
      steps: stepsData,
      refs: refsRes.rows,
      mealTypes,
      dietaryTags,
      renderedHtml,
      hasSubRecipes,
      baseQuantity,
      isOwner,
      isFavorited,
      loggedIn: ctx.state.user != null,
      pantryIngredientIds,
      pantryIngredientNames,
      pantryItems,
      householdId: ctx.state.householdId,
      unitSystem: ctx.state.unitSystem,
    });
  },
  async POST(ctx) {
    const slug = ctx.params.slug;
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      const recipeRes = await ctx.state.db.query<{ household_id: number }>(
        "SELECT household_id FROM recipes WHERE slug = $1",
        [slug],
      );
      if (
        recipeRes.rows.length === 0 || !ctx.state.householdId ||
        recipeRes.rows[0].household_id !== ctx.state.householdId
      ) {
        return new Response(null, {
          status: 303,
          headers: { Location: `/recipes/${slug}` },
        });
      }
      await ctx.state.db.query("DELETE FROM recipes WHERE slug = $1", [slug]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/recipes" },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}` },
    });
  },
});

export default define.page<typeof handler>(function RecipeViewPage({
  data: {
    recipe,
    ingredientsForTemplate,
    tools,
    steps,
    refs,
    mealTypes,
    dietaryTags,
    renderedHtml,
    hasSubRecipes,
    isOwner,
    isFavorited,
    loggedIn,
    baseQuantity,
    pantryIngredientIds,
    pantryIngredientNames,
    pantryItems,
    householdId,
    unitSystem,
  },
}) {
  return (
    <div>
      <div class="print-hidden">
        <BackLink href="/recipes" label="Back to Recipes" />
      </div>

      {recipe.cover_image_url && (
        <div class="mt-4">
          <ImageLightbox
            src={recipe.cover_image_url}
            alt={recipe.title}
            class="w-full h-64 object-cover"
          />
        </div>
      )}

      <div class="flex items-center gap-3 mt-4 mb-2 flex-wrap">
        <h1 class="text-3xl font-bold flex-1">{recipe.title}</h1>
        {recipe.private && (
          <span class="print-hidden text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-2 py-1 rounded">
            private
          </span>
        )}
        <span class="print-hidden flex items-center gap-3">
          {loggedIn && (
            <FavoriteButton
              recipeId={recipe.id}
              initialFavorited={isFavorited}
            />
          )}
          {isOwner && (
            <>
              <a
                href={`/recipes/${recipe.slug}/edit`}
                class="btn btn-outline"
              >
                <TbEdit class="size-3.5" />Edit
              </a>
              <form method="POST" class="inline">
                <input type="hidden" name="_method" value="DELETE" />
                <ConfirmButton
                  message="Delete this recipe?"
                  class="btn btn-danger"
                >
                  Delete
                </ConfirmButton>
              </form>
            </>
          )}
        </span>
      </div>
      {recipe.description && (
        <p class="text-stone-600 mt-1">{recipe.description}</p>
      )}

      {(mealTypes.length > 0 || dietaryTags.length > 0) && (
        <div class="flex flex-wrap gap-1.5 mt-2">
          {mealTypes.map((mt) => (
            <span
              key={mt}
              class="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded capitalize"
            >
              {mt}
            </span>
          ))}
          {dietaryTags.map((dt) => (
            <span
              key={dt}
              class="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded capitalize"
            >
              {dt}
            </span>
          ))}
        </div>
      )}

      <div class="flex gap-2 sm:gap-4 text-sm text-stone-500 mt-2 flex-wrap">
        <span>{formatQuantity(baseQuantity)}</span>
        {recipe.difficulty && (
          <span class="capitalize">{recipe.difficulty}</span>
        )}
        {recipe.prep_time != null && (
          <span>Prep: {formatDuration(recipe.prep_time)}</span>
        )}
        {recipe.cook_time != null && (
          <span>Cook: {formatDuration(recipe.cook_time)}</span>
        )}
      </div>

      <div class="mt-6">
        <RecipeView
          steps={steps.map((s) => ({
            title: s.title,
            body: s.body,
          }))}
          ingredients={ingredientsForTemplate}
          tools={tools.map((m) => ({
            id: m.tool_id,
            name: m.tool_name,
            settings: m.settings ?? undefined,
            usage: m.usage_description ?? undefined,
          }))}
          refs={refs.map((r) => ({
            slug: r.ref_slug,
            title: r.ref_title,
          }))}
          baseQuantity={baseQuantity}
          slug={recipe.slug}
          hasSubRecipes={hasSubRecipes}
          initialHtml={renderedHtml}
          recipeId={recipe.id}
          loggedIn={loggedIn}
          pantryIngredientIds={pantryIngredientIds}
          pantryIngredientNames={pantryIngredientNames}
          pantryItems={pantryItems}
          householdId={householdId}
          unitSystem={unitSystem}
        />
      </div>
    </div>
  );
});
