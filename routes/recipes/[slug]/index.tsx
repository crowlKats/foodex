import { handler, page } from "./$index.ts";
import { HttpError } from "fresh/errors";
import type {
  RecipeIngredient,
  RecipeReference,
  RecipeStep,
  RecipeStepDep,
  RecipeStepSection,
  RecipeTag,
  RecipeTool,
  RecipeWithCover,
} from "../../../db/types.ts";
import { computeStepAfters } from "../../../lib/step-graph.ts";
import { logAudit } from "../../../lib/audit.ts";
import { loadStock, type StockItem } from "../../../lib/pantry.ts";
import { formatDuration } from "../../../lib/duration.ts";
import { computeIngredientCost } from "../../../lib/unit-convert.ts";
import { formatAmount } from "../../../lib/format.ts";
import { formatQuantity } from "../../../lib/quantity.ts";
import type { RecipeQuantity } from "../../../lib/quantity.ts";
import RecipeView from "../../../islands/RecipeView.tsx";
import ImageLightbox from "../../../islands/ImageLightbox.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import { Button, ButtonLink } from "../../../components/Button.tsx";
import FavoriteButton from "../../../islands/FavoriteButton.tsx";
import AddToCollectionButton from "../../../islands/AddToCollectionButton.tsx";
import { IconEdit } from "@tabler/icons-preact";
import ShareButton from "../../../islands/ShareButton.tsx";
import { SOURCE_TYPE_LABELS } from "../../../lib/recipe-tags.ts";

export const handlers = handler({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query<
      RecipeWithCover & { household_name: string | null }
    >(
      `SELECT r.*, m.url as cover_image_url, h.name as household_name
       FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       LEFT JOIN households h ON h.id = r.household_id
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
      RecipeIngredient & { density: number | null; always_on_hand: boolean }
    >(
      `SELECT ri.*, g.name as ingredient_name, g.unit as ingredient_unit, g.density,
              COALESCE(g.always_on_hand, false) as always_on_hand
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const toolsRes = await ctx.state.db.query<RecipeTool & { owned: boolean }>(
      `SELECT rt.*, t.name as tool_name, t.description as tool_description,
              EXISTS (SELECT 1 FROM household_tools ht
                      WHERE ht.household_id = $2 AND ht.tool_id = rt.tool_id) as owned
       FROM recipe_tools rt
       JOIN tools t ON t.id = rt.tool_id
       WHERE rt.recipe_id = $1
       ORDER BY rt.sort_order, rt.id`,
      [recipe.id, ctx.state.householdId],
    );

    const stepsRes = await ctx.state.db.query<RecipeStep>(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );

    const sectionsRes = await ctx.state.db.query<RecipeStepSection>(
      `SELECT * FROM recipe_step_sections WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );

    const sectionDepsRes = await ctx.state.db.query<
      { section_id: string; depends_on: string }
    >(
      `SELECT sd.section_id, sd.depends_on
       FROM recipe_section_deps sd
       JOIN recipe_step_sections s ON s.id = sd.section_id
       WHERE s.recipe_id = $1`,
      [recipe.id],
    );

    const [stepMediaRes, stepDepsRes] = await Promise.all([
      ctx.state.db.query<
        { step_id: string; media_id: string; url: string }
      >(
        `SELECT rsm.step_id, m.id as media_id, m.url
         FROM recipe_step_media rsm
         JOIN media m ON m.id = rsm.media_id
         JOIN recipe_steps rs ON rs.id = rsm.step_id
         WHERE rs.recipe_id = $1
         ORDER BY rsm.step_id, rsm.sort_order`,
        [recipe.id],
      ),
      ctx.state.db.query<RecipeStepDep>(
        `SELECT sd.step_id, sd.depends_on
         FROM recipe_step_deps sd
         JOIN recipe_steps rs ON rs.id = sd.step_id
         WHERE rs.recipe_id = $1`,
        [recipe.id],
      ),
    ]);
    const stepAfterMap = computeStepAfters(
      stepsRes.rows.map((s) => s.id),
      stepDepsRes.rows,
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
      string,
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
        ingredient_id: string;
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
          note: i.note ?? undefined,
          ingredient_id: ingredientId,
          base_cost: baseCost ?? undefined,
          currency: priceInfo?.currency,
          density: i.density,
          always_on_hand: i.always_on_hand ?? false,
          intermediate: i.intermediate ?? false,
        };
      });

    const stepsData = stepsRes.rows.map((s) => ({
      title: s.title,
      body: s.body,
      media: stepMediaMap.get(String(s.id)) ?? [],
      after: stepAfterMap.get(s.id) ?? [],
      section_id: s.section_id,
    }));

    // Build per-section index of which other sections it depends on (by index in sectionsData)
    const sectionIndexById = new Map<string, number>();
    sectionsRes.rows.forEach((s, i) => sectionIndexById.set(s.id, i));
    const sectionAfters: number[][] = sectionsRes.rows.map(() => []);
    for (const dep of sectionDepsRes.rows) {
      const sIdx = sectionIndexById.get(dep.section_id);
      const dIdx = sectionIndexById.get(dep.depends_on);
      if (sIdx != null && dIdx != null) sectionAfters[sIdx].push(dIdx);
    }
    sectionAfters.forEach((arr) => arr.sort((a, b) => a - b));

    const sectionsData = sectionsRes.rows.map((s, i) => ({
      id: s.id,
      key: s.key,
      title: s.title,
      after: sectionAfters[i],
    }));

    // Resolve every `@recipe(slug)` directive referenced in any step body so
    // the island can render sub-recipe links without a follow-up fetch.
    const recipeRefSlugs = new Set<string>();
    for (const s of stepsData) {
      const re = /@recipe\(([a-z0-9_-]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s.body)) !== null) recipeRefSlugs.add(m[1]);
    }
    const recipeRefs: { slug: string; title: string }[] = [];
    if (recipeRefSlugs.size > 0) {
      const slugs = [...recipeRefSlugs];
      const res = await ctx.state.db.query<{ slug: string; title: string }>(
        `SELECT slug, title FROM recipes
         WHERE slug = ANY($1) AND (private = false OR household_id = $2)`,
        [slugs, ctx.state.householdId],
      );
      for (const r of res.rows) {
        recipeRefs.push({ slug: r.slug, title: r.title });
      }
    }

    // Same for `@dish(slug)` directives. A dish only resolves when at least
    // one recipe the viewer may see makes it; otherwise the dish's name
    // (derived from someone's private recipe title) would leak.
    const dishRefSlugs = new Set<string>();
    for (const s of stepsData) {
      const re = /@dish\(([a-z0-9_-]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s.body)) !== null) dishRefSlugs.add(m[1]);
    }
    const dishRefs: { slug: string; title: string }[] = [];
    if (dishRefSlugs.size > 0) {
      const res = await ctx.state.db.query<{ slug: string; name: string }>(
        `SELECT d.slug, d.name FROM dishes d
         WHERE d.slug = ANY($1)
           AND EXISTS (
             SELECT 1 FROM recipes r WHERE r.dish_id = d.id
               AND (r.private = false OR r.household_id = $2)
           )`,
        [[...dishRefSlugs], ctx.state.householdId],
      );
      for (const d of res.rows) {
        dishRefs.push({ slug: d.slug, title: d.name });
      }
    }

    const isOwner = ctx.state.householdId != null &&
      recipe.household_id === ctx.state.householdId;

    // Household stock, passed to the view as-is: matching and the amount
    // arithmetic both happen in lib/inventory.ts, on both sides of the wire.
    const pantryItems: StockItem[] = ctx.state.householdId
      ? await loadStock(ctx.state.db, ctx.state.householdId)
      : [];

    let isFavorited = false;
    if (ctx.state.user) {
      const favRes = await ctx.state.db.query(
        "SELECT 1 FROM recipe_favorites WHERE user_id = $1 AND recipe_id = $2",
        [ctx.state.user.id, recipe.id],
      );
      isFavorited = favRes.rows.length > 0;
    }

    // Load fork origin
    let forkedFrom: { title: string; slug: string } | null = null;
    if (recipe.forked_from_id) {
      const forkRes = await ctx.state.db.query<
        { title: string; slug: string }
      >(
        `SELECT title, slug FROM recipes
         WHERE id = $1 AND (private = false OR household_id = $2)`,
        [recipe.forked_from_id, ctx.state.householdId],
      );
      if (forkRes.rows.length > 0) {
        forkedFrom = forkRes.rows[0];
      }
    }

    // Count forks of this recipe
    const forkCountRes = await ctx.state.db.query<{ count: number }>(
      "SELECT count(*)::int as count FROM recipes WHERE forked_from_id = $1",
      [recipe.id],
    );
    const forkCount = forkCountRes.rows[0]?.count ?? 0;

    // Other recipes for the same dish (visible ones only)
    let dish: { name: string; slug: string; otherCount: number } | null = null;
    if (recipe.dish_id) {
      const dishRes = await ctx.state.db.query<{
        name: string;
        slug: string;
        other_count: number;
      }>(
        `SELECT d.name, d.slug,
                (SELECT count(*)::int FROM recipes r2
                 WHERE r2.dish_id = d.id AND r2.id != $2
                   AND (r2.private = false OR r2.household_id = $3)) as other_count
         FROM dishes d WHERE d.id = $1`,
        [recipe.dish_id, recipe.id, ctx.state.householdId],
      );
      if (dishRes.rows.length > 0) {
        dish = {
          name: dishRes.rows[0].name,
          slug: dishRes.rows[0].slug,
          otherCount: dishRes.rows[0].other_count,
        };
      }
    }

    // Load output ingredient name
    let outputIngredient: {
      ingredient_id: string;
      name: string;
      amount: number | null;
      unit: string | null;
      expires_days: number | null;
    } | null = null;
    if (recipe.output_ingredient_id) {
      const oRes = await ctx.state.db.query<{ name: string }>(
        "SELECT name FROM ingredients WHERE id = $1",
        [recipe.output_ingredient_id],
      );
      if (oRes.rows.length > 0) {
        outputIngredient = {
          ingredient_id: recipe.output_ingredient_id,
          name: oRes.rows[0].name,
          amount: recipe.output_amount,
          unit: recipe.output_unit,
          expires_days: recipe.output_expires_days,
        };
      }
    }

    // Load source recipes for ingredients (recipes that output an ingredient
    // used here). Several recipes can produce the same ingredient, so each
    // entry is a list, not a single winner.
    const sourceRecipes = new Map<string, { title: string; slug: string }[]>();
    if (ingredientIds.length > 0) {
      const srcRes = await ctx.state.db.query<{
        output_ingredient_id: string;
        title: string;
        slug: string;
      }>(
        `SELECT output_ingredient_id, title, slug FROM recipes
         WHERE output_ingredient_id = ANY($1) AND id != $2
           AND (private = false OR household_id = $3)
         ORDER BY title
         LIMIT 100`,
        [ingredientIds, recipe.id, ctx.state.householdId],
      );
      for (const row of srcRes.rows) {
        const list = sourceRecipes.get(row.output_ingredient_id) ?? [];
        list.push({ title: row.title, slug: row.slug });
        sourceRecipes.set(row.output_ingredient_id, list);
      }
    }

    // Load user's collections for "add to collection" button
    let collections: { id: string; name: string; hasRecipe: boolean }[] = [];
    if (ctx.state.householdId) {
      const collRes = await ctx.state.db.query<
        { id: string; name: string; has_recipe: boolean }
      >(
        `SELECT c.id, c.name,
                EXISTS (SELECT 1 FROM collection_recipes cr WHERE cr.collection_id = c.id AND cr.recipe_id = $2) as has_recipe
         FROM collections c
         WHERE c.household_id = $1
         ORDER BY c.name`,
        [ctx.state.householdId, recipe.id],
      );
      collections = collRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        hasRecipe: r.has_recipe,
      }));
    }

    const origin = new URL(ctx.req.url).origin;

    ctx.state.pageTitle = recipe.title;
    return {
      data: {
        recipe,
        shareUrl: `${origin}/recipes/${recipe.slug}`,
        ingredientsForTemplate,
        tools: toolsRes.rows,
        steps: stepsData,
        sections: sectionsData,
        refs: refsRes.rows,
        recipeRefs,
        dishRefs,
        mealTypes,
        dietaryTags,
        baseQuantity,
        isOwner,
        isFavorited,
        loggedIn: ctx.state.user != null,
        pantryItems,
        householdId: ctx.state.householdId,
        unitSystem: ctx.state.unitSystem,
        forkedFrom,
        forkCount,
        dish,
        collections,
        outputIngredient,
        sourceRecipes: Object.fromEntries(sourceRecipes),
      },
    };
  },
  async POST(ctx) {
    const slug = ctx.params.slug;
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      const recipeRes = await ctx.state.db.query<
        { id: string; title: string; household_id: string }
      >(
        "SELECT id, title, household_id FROM recipes WHERE slug = $1",
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
      if (ctx.state.user) {
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "recipe.delete",
          targetType: "recipe",
          targetId: recipeRes.rows[0].id,
          targetLabel: recipeRes.rows[0].title,
          detail: `slug ${slug}`,
          householdId: ctx.state.householdId,
        });
      }
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

export default page(function RecipeViewPage({
  data: {
    recipe,
    shareUrl,
    ingredientsForTemplate,
    tools,
    steps,
    sections,
    refs,
    recipeRefs,
    dishRefs,
    mealTypes,
    dietaryTags,
    isOwner,
    isFavorited,
    loggedIn,
    baseQuantity,
    pantryItems,
    householdId,
    unitSystem,
    forkedFrom,
    forkCount,
    dish,
    collections,
    outputIngredient,
    sourceRecipes,
  },
}) {
  return (
    <div>
      <div class="print-hidden">
        <BackLink href="/recipes" label="Back to Recipes" />
      </div>

      {recipe.cover_image_url && (
        <div class="mt-4 mb-4">
          <ImageLightbox
            src={recipe.cover_image_url}
            alt={recipe.title}
            class="w-full h-64 object-cover"
          />
        </div>
      )}

      <div class="flex items-center gap-3 mt-4 mb-2 flex-wrap">
        <h1 class="text-2xl font-bold min-w-0 flex-1 max-sm:basis-full">
          {recipe.title}
        </h1>
        {recipe.private && (
          <span class="print-hidden text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-2 py-1 rounded">
            private
          </span>
        )}
        <span class="print-hidden flex items-center gap-2 flex-wrap max-sm:w-full">
          {loggedIn && (
            <FavoriteButton
              recipeId={recipe.id}
              initialFavorited={isFavorited}
            />
          )}
          {loggedIn && (
            <AddToCollectionButton
              recipeId={recipe.id}
              collections={collections}
            />
          )}
          {!recipe.private && (
            <ShareButton url={shareUrl} title={recipe.title} />
          )}
          {loggedIn && (
            <form
              action={`/recipes/${recipe.slug}/clone`}
              method="POST"
              class="inline"
            >
              <Button type="submit" variant="outline">Fork</Button>
            </form>
          )}
          {isOwner && (
            <ButtonLink
              href={`/recipes/${recipe.slug}/edit`}
              variant="outline"
              icon={IconEdit}
            >
              Edit
            </ButtonLink>
          )}
        </span>
      </div>
      {recipe.household_name && (
        <p class="text-sm text-stone-500 mt-1">by {recipe.household_name}</p>
      )}
      {forkedFrom && (
        <p class="text-sm text-stone-500 mt-1">
          Forked from{" "}
          <a href={`/recipes/${forkedFrom.slug}`} class="link">
            {forkedFrom.title}
          </a>
        </p>
      )}
      {forkCount > 0 && (
        <p class="text-xs text-stone-400 mt-1">
          {forkCount} {forkCount === 1 ? "fork" : "forks"}
        </p>
      )}
      {dish && dish.otherCount > 0 && (
        <p class="text-sm text-stone-500 mt-1">
          <a href={`/dishes/${dish.slug}`} class="link">
            {dish.otherCount}{" "}
            {dish.otherCount === 1
              ? "other recipe makes"
              : "other recipes make"} this dish
          </a>
        </p>
      )}
      {recipe.description && (
        <p class="text-stone-600 mt-1">{recipe.description}</p>
      )}

      {recipe.source_type && (
        <p class="text-sm text-stone-500 mt-1">
          Source: {SOURCE_TYPE_LABELS[recipe.source_type] ?? recipe.source_type}
          {recipe.source_name && (
            <span>
              {" — "}
              {recipe.source_url
                ? (
                  <a
                    href={recipe.source_url}
                    class="link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {recipe.source_name}
                  </a>
                )
                : recipe.source_name}
            </span>
          )}
          {!recipe.source_name && recipe.source_url && (
            <span>
              {" — "}
              <a
                href={recipe.source_url}
                class="link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {recipe.source_url}
              </a>
            </span>
          )}
        </p>
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
        {
          /* Kept in step with the scaler by RecipeView; the two used to sit a
            few centimetres apart showing different numbers. */
        }
        <span data-recipe-quantity>{formatQuantity(baseQuantity)}</span>
        {recipe.quantity_type === "dimensions" &&
          recipe.quantity_servings != null && (
          <span>~{recipe.quantity_servings} servings</span>
        )}
        {recipe.difficulty && (
          <span class="capitalize">{recipe.difficulty}</span>
        )}
        {recipe.prep_time != null && (
          <span>Prep: {formatDuration(recipe.prep_time)}</span>
        )}
        {recipe.cook_time != null && (
          <span>Cook: {formatDuration(recipe.cook_time)}</span>
        )}
        {recipe.rest_time != null && (
          <span>Rest: {formatDuration(recipe.rest_time)}</span>
        )}
      </div>

      {outputIngredient && (
        <p class="text-sm text-stone-500 mt-2">
          Yields: {outputIngredient.amount != null && (
            <span>
              {formatAmount(
                outputIngredient.amount,
                outputIngredient.unit ?? undefined,
              )}
              {outputIngredient.unit ? ` ${outputIngredient.unit}` : ""}
              {" "}
            </span>
          )}
          {outputIngredient.name}
          {outputIngredient.expires_days != null && (
            <span class="ml-2 text-stone-400">
              ({outputIngredient.expires_days % 30 === 0 &&
                  outputIngredient.expires_days >= 30
                ? `${outputIngredient.expires_days / 30} month`
                : outputIngredient.expires_days % 7 === 0 &&
                    outputIngredient.expires_days >= 7
                ? `${outputIngredient.expires_days / 7} week`
                : `${outputIngredient.expires_days} day`} shelf life)
            </span>
          )}
        </p>
      )}

      <div class="mt-6">
        <RecipeView
          steps={steps.map((s) => ({
            title: s.title,
            body: s.body,
            after: s.after,
            section_id: s.section_id,
          }))}
          sections={sections}
          ingredients={ingredientsForTemplate}
          tools={tools.map((m) => ({
            id: m.tool_id,
            name: m.tool_name,
            settings: m.settings ?? undefined,
            owned: m.owned,
          }))}
          refs={refs.map((r) => ({
            slug: r.ref_slug,
            title: r.ref_title,
          }))}
          recipeRefs={recipeRefs}
          dishRefs={dishRefs}
          baseQuantity={baseQuantity}
          slug={recipe.slug}
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          loggedIn={loggedIn}
          pantryItems={pantryItems}
          householdId={householdId}
          unitSystem={unitSystem}
          sourceRecipes={sourceRecipes}
        />
      </div>
    </div>
  );
});
