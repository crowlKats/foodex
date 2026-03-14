import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import { renderRecipeSteps } from "../../../lib/markdown.ts";
import { formatDuration } from "../../../lib/duration.ts";
import { scaleIngredients } from "../../../lib/template.ts";
import { formatQuantity } from "../../../lib/quantity.ts";
import type { RecipeQuantity } from "../../../lib/quantity.ts";
import RecipeView from "../../../islands/RecipeView.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import TbEdit from "tb-icons/TbEdit";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query(
      `SELECT r.*, m.url as cover_image_url FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE r.slug = $1`,
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipe = recipeRes.rows[0];

    const ingredientsRes = await ctx.state.db.query(
      `SELECT ri.*, g.name as grocery_name, g.unit as grocery_unit
       FROM recipe_ingredients ri
       LEFT JOIN groceries g ON g.id = ri.grocery_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const toolsRes = await ctx.state.db.query(
      `SELECT rt.*, t.name as tool_name, t.description as tool_description
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

    const refsRes = await ctx.state.db.query(
      `SELECT rr.*, r.title as ref_title, r.slug as ref_slug
       FROM recipe_references rr
       JOIN recipes r ON r.id = rr.referenced_recipe_id
       WHERE rr.recipe_id = $1
       ORDER BY rr.sort_order, rr.id`,
      [recipe.id],
    );

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

    // Build ingredient variables for template engine
    const ingredientsForTemplate = ingredientsRes.rows
      .filter((i) => i.key && i.amount != null)
      .map((i) => ({
        key: String(i.key),
        amount: Number(i.amount),
        unit: String(i.unit ?? ""),
        name: String(i.grocery_name ?? i.name),
        grocery_id: i.grocery_id ? Number(i.grocery_id) : undefined,
      }));

    const scaledIngredients = scaleIngredients(
      ingredientsForTemplate,
      1,
    );

    // Check for sub-recipe references across all step bodies
    const hasSubRecipes = stepsRes.rows.some((s) =>
      /@recipe\([a-z0-9_-]+\)/.test(String(s.body))
    );

    const stepsData = stepsRes.rows.map((s: Record<string, unknown>) => ({
      title: String(s.title),
      body: String(s.body),
      media: stepMediaMap.get(String(s.id)) ?? [],
    }));

    const renderedHtml = await renderRecipeSteps(
      stepsData,
      { ratio: 1 },
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

    return page({
      recipe,
      ingredientsForTemplate,
      tools: toolsRes.rows,
      steps: stepsData,
      refs: refsRes.rows,
      renderedHtml,
      hasSubRecipes,
      baseQuantity,
    });
  },
  async POST(ctx) {
    const slug = ctx.params.slug;
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
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

export default define.page<typeof handler>(function RecipeViewPage({ data }) {
  const {
    recipe,
    ingredientsForTemplate,
    tools,
    steps,
    refs,
    renderedHtml,
    hasSubRecipes,
  } = data as {
    recipe: Record<string, unknown>;
    ingredientsForTemplate: {
      key: string;
      amount: number;
      unit: string;
      name: string;
      grocery_id?: number;
    }[];
    tools: Record<string, unknown>[];
    steps: { title: string; body: string }[];
    refs: Record<string, unknown>[];
    renderedHtml: string;
    hasSubRecipes: boolean;
    baseQuantity: RecipeQuantity;
  };

  return (
    <div>
      <BackLink href="/recipes" label="Back to Recipes" />

      {recipe.cover_image_url && (
        <img
          src={String(recipe.cover_image_url)}
          alt={String(recipe.title)}
          class="w-full h-64 object-cover mt-4"
        />
      )}

      <div class="flex items-center gap-3 mt-4 mb-2 flex-wrap">
        <h1 class="text-3xl font-bold flex-1">{String(recipe.title)}</h1>
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
      </div>
      {recipe.description && (
        <p class="text-stone-600 mt-1">{String(recipe.description)}</p>
      )}

      <div class="flex gap-2 sm:gap-4 text-sm text-stone-500 mt-2 flex-wrap">
        <span>{formatQuantity(data.baseQuantity)}</span>
        {recipe.prep_time != null && (
          <span>Prep: {formatDuration(Number(recipe.prep_time))}</span>
        )}
        {recipe.cook_time != null && (
          <span>Cook: {formatDuration(Number(recipe.cook_time))}</span>
        )}
      </div>

      <div class="mt-6">
        <RecipeView
          steps={steps.map((s) => ({
            title: String(s.title),
            body: String(s.body),
          }))}
          ingredients={ingredientsForTemplate}
          tools={tools.map((m) => ({
            id: Number(m.tool_id),
            name: String(m.tool_name),
            settings: m.settings ? String(m.settings) : undefined,
            usage: m.usage_description
              ? String(m.usage_description)
              : undefined,
          }))}
          refs={refs.map((r) => ({
            slug: String(r.ref_slug),
            title: String(r.ref_title),
          }))}
          baseQuantity={data.baseQuantity}
          slug={String(recipe.slug)}
          hasSubRecipes={hasSubRecipes}
          initialHtml={renderedHtml}
        />
      </div>
    </div>
  );
});
