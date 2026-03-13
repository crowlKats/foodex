import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import { renderRecipeBody } from "../../../lib/markdown.ts";
import RecipeView from "../../../islands/RecipeView.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query(
      "SELECT * FROM recipes WHERE slug = $1",
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

    const devicesRes = await ctx.state.db.query(
      `SELECT rd.*, d.name as device_name, d.description as device_description
       FROM recipe_devices rd
       JOIN devices d ON d.id = rd.device_id
       WHERE rd.recipe_id = $1
       ORDER BY rd.sort_order, rd.id`,
      [recipe.id],
    );

    const refsRes = await ctx.state.db.query(
      `SELECT rr.*, r.title as ref_title, r.slug as ref_slug
       FROM recipe_references rr
       JOIN recipes r ON r.id = rr.referenced_recipe_id
       WHERE rr.recipe_id = $1
       ORDER BY rr.sort_order, rr.id`,
      [recipe.id],
    );

    const servings = Number(recipe.default_servings);
    const hasSubRecipes = /@recipe\([a-z0-9_-]+\)/.test(
      String(recipe.body),
    );

    const renderedBody = await renderRecipeBody(
      String(recipe.body),
      { servings },
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
      ingredients: ingredientsRes.rows,
      devices: devicesRes.rows,
      refs: refsRes.rows,
      renderedBody,
      hasSubRecipes,
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
  const { recipe, ingredients, devices, refs, renderedBody, hasSubRecipes } =
    data as {
      recipe: Record<string, unknown>;
      ingredients: Record<string, unknown>[];
      devices: Record<string, unknown>[];
      refs: Record<string, unknown>[];
      renderedBody: string;
      hasSubRecipes: boolean;
    };

  return (
    <div>
      <div class="flex items-center gap-4 mb-4">
        <a href="/recipes" class="text-blue-600 hover:underline text-sm">
          &larr; Back to Recipes
        </a>
        <a
          href={`/recipes/${recipe.slug}/edit`}
          class="text-blue-600 hover:underline text-sm"
        >
          Edit
        </a>
        <form method="POST" class="inline">
          <input type="hidden" name="_method" value="DELETE" />
          <ConfirmButton
            message="Delete this recipe?"
            class="text-red-600 hover:underline text-sm"
          >
            Delete
          </ConfirmButton>
        </form>
      </div>

      <h1 class="text-3xl font-bold">{String(recipe.title)}</h1>
      {recipe.description && (
        <p class="text-gray-600 mt-1">{String(recipe.description)}</p>
      )}

      <div class="flex gap-4 text-sm text-gray-500 mt-2">
        <span>{String(recipe.default_servings)} servings</span>
        {recipe.prep_time != null && (
          <span>Prep: {String(recipe.prep_time)} min</span>
        )}
        {recipe.cook_time != null && (
          <span>Cook: {String(recipe.cook_time)} min</span>
        )}
      </div>

      <div class="grid gap-6 lg:grid-cols-3 mt-6">
        <div class="lg:col-span-1 space-y-4">
          {ingredients.length > 0 && (
            <div class="bg-white rounded-lg shadow p-4">
              <h2 class="font-semibold mb-2">Ingredients</h2>
              <ul class="space-y-1">
                {ingredients.map((i) => (
                  <li key={String(i.id)} class="text-sm">
                    {i.amount != null && (
                      <span class="font-medium">
                        {String(i.amount)} {String(i.unit ?? "")}
                        {" "}
                      </span>
                    )}
                    {i.grocery_id
                      ? (
                        <a
                          href={`/groceries/${i.grocery_id}`}
                          class="text-blue-600 hover:underline"
                        >
                          {String(i.grocery_name ?? i.name)}
                        </a>
                      )
                      : <span>{String(i.name)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {devices.length > 0 && (
            <div class="bg-white rounded-lg shadow p-4">
              <h2 class="font-semibold mb-2">Devices</h2>
              <ul class="space-y-1">
                {devices.map((d) => (
                  <li key={String(d.id)} class="text-sm">
                    <a
                      href={`/devices/${d.device_id}`}
                      class="text-blue-600 hover:underline font-medium"
                    >
                      {String(d.device_name)}
                    </a>
                    {d.settings && (
                      <span class="text-gray-500">
                        {` (${String(d.settings)})`}
                      </span>
                    )}
                    {d.usage_description && (
                      <div class="text-gray-500 text-xs">
                        {String(d.usage_description)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {refs.length > 0 && (
            <div class="bg-white rounded-lg shadow p-4">
              <h2 class="font-semibold mb-2">Sub-recipes</h2>
              <ul class="space-y-1">
                {refs.map((r) => (
                  <li key={String(r.id)}>
                    <a
                      href={`/recipes/${r.ref_slug}`}
                      class="text-blue-600 hover:underline text-sm"
                    >
                      {String(r.ref_title)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div class="lg:col-span-2">
          <RecipeView
            recipeBody={String(recipe.body)}
            defaultServings={Number(recipe.default_servings)}
            slug={String(recipe.slug)}
            hasSubRecipes={hasSubRecipes}
            initialHtml={renderedBody}
          />
        </div>
      </div>
    </div>
  );
});
