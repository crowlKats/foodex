import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import { parseFormArray } from "../../../lib/form.ts";
import IngredientForm from "../../../islands/IngredientForm.tsx";
import DeviceForm from "../../../islands/DeviceForm.tsx";

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
      `SELECT ri.*, g.name as grocery_name
       FROM recipe_ingredients ri
       LEFT JOIN groceries g ON g.id = ri.grocery_id
       WHERE ri.recipe_id = $1
       ORDER BY ri.sort_order, ri.id`,
      [recipe.id],
    );

    const devicesRes = await ctx.state.db.query(
      `SELECT rd.*, d.name as device_name
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
       ORDER BY rr.sort_order`,
      [recipe.id],
    );

    const groceriesRes = await ctx.state.db.query(
      "SELECT id, name, unit FROM groceries ORDER BY name",
    );
    const allDevicesRes = await ctx.state.db.query(
      "SELECT id, name FROM devices ORDER BY name",
    );
    const allRecipesRes = await ctx.state.db.query(
      "SELECT id, title, slug FROM recipes WHERE id != $1 ORDER BY title",
      [recipe.id],
    );

    return page({
      recipe,
      ingredients: ingredientsRes.rows,
      devices: devicesRes.rows,
      refs: refsRes.rows,
      groceries: groceriesRes.rows,
      allDevices: allDevicesRes.rows,
      allRecipes: allRecipesRes.rows,
    });
  },
  async POST(ctx) {
    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query(
      "SELECT id FROM recipes WHERE slug = $1",
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipeId = recipeRes.rows[0].id;

    const form = await ctx.req.formData();
    const title = form.get("title") as string;
    const newSlug = form.get("slug") as string;
    const description = form.get("description") as string;
    const body = form.get("body") as string;
    const defaultServings = parseInt(
      form.get("default_servings") as string,
    ) || 4;
    const prepTime = form.get("prep_time")
      ? parseInt(form.get("prep_time") as string)
      : null;
    const cookTime = form.get("cook_time")
      ? parseInt(form.get("cook_time") as string)
      : null;

    // Update recipe
    await ctx.state.db.query(
      `UPDATE recipes SET title=$1, slug=$2, description=$3, body=$4,
       default_servings=$5, prep_time=$6, cook_time=$7, updated_at=now()
       WHERE id=$8`,
      [
        title?.trim(),
        newSlug?.trim(),
        description?.trim() || null,
        body ?? "",
        defaultServings,
        prepTime,
        cookTime,
        recipeId,
      ],
    );

    // Re-insert ingredients
    await ctx.state.db.query(
      "DELETE FROM recipe_ingredients WHERE recipe_id = $1",
      [recipeId],
    );
    const ingredients = parseFormArray(form, "ingredients");
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.name?.trim()) continue;
      await ctx.state.db.query(
        `INSERT INTO recipe_ingredients (recipe_id, grocery_id, name, amount, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          recipeId,
          ing.grocery_id ? parseInt(ing.grocery_id) : null,
          ing.name.trim(),
          ing.amount ? parseFloat(ing.amount) : null,
          ing.unit?.trim() || null,
          i,
        ],
      );
    }

    // Re-insert devices
    await ctx.state.db.query(
      "DELETE FROM recipe_devices WHERE recipe_id = $1",
      [recipeId],
    );
    const deviceEntries = parseFormArray(form, "devices");
    for (let i = 0; i < deviceEntries.length; i++) {
      const dev = deviceEntries[i];
      if (!dev.device_id) continue;
      await ctx.state.db.query(
        `INSERT INTO recipe_devices (recipe_id, device_id, usage_description, settings, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          recipeId,
          parseInt(dev.device_id),
          dev.usage_description?.trim() || null,
          dev.settings?.trim() || null,
          i,
        ],
      );
    }

    // Re-insert references
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

    const finalSlug = newSlug?.trim() || slug;
    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${finalSlug}` },
    });
  },
});

export default define.page<typeof handler>(function RecipeEdit({ data }) {
  const {
    recipe,
    ingredients,
    devices,
    refs,
    groceries,
    allDevices,
    allRecipes,
  } = data as {
    recipe: Record<string, unknown>;
    ingredients: Record<string, unknown>[];
    devices: Record<string, unknown>[];
    refs: Record<string, unknown>[];
    groceries: Record<string, unknown>[];
    allDevices: Record<string, unknown>[];
    allRecipes: Record<string, unknown>[];
  };

  const ingredientData = ingredients.map((i) => ({
    name: String(i.name),
    amount: i.amount != null ? String(i.amount) : "",
    unit: String(i.unit ?? ""),
    grocery_id: i.grocery_id != null ? String(i.grocery_id) : "",
  }));

  const deviceData = devices.map((d) => ({
    device_id: String(d.device_id),
    usage_description: String(d.usage_description ?? ""),
    settings: String(d.settings ?? ""),
  }));

  const refData = refs.map((r) => ({
    referenced_recipe_id: String(r.referenced_recipe_id),
  }));

  return (
    <div>
      <div class="flex items-center gap-4 mb-4">
        <a href="/recipes" class="text-blue-600 hover:underline text-sm">
          &larr; Back to Recipes
        </a>
        <a
          href={`/recipes/${recipe.slug}`}
          class="text-blue-600 hover:underline text-sm"
        >
          View
        </a>
      </div>

      <h1 class="text-2xl font-bold mb-4">Edit: {String(recipe.title)}</h1>

      <form method="POST" class="space-y-6">
        <div class="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 class="font-semibold">Details</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                name="title"
                value={String(recipe.title)}
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Slug</label>
              <input
                type="text"
                name="slug"
                value={String(recipe.slug)}
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              rows={2}
              class="w-full border rounded px-3 py-2"
            >
              {String(recipe.description ?? "")}
            </textarea>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1">Servings</label>
              <input
                type="number"
                name="default_servings"
                value={String(recipe.default_servings)}
                min="1"
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Prep (min)</label>
              <input
                type="number"
                name="prep_time"
                value={String(recipe.prep_time ?? "")}
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Cook (min)</label>
              <input
                type="number"
                name="cook_time"
                value={String(recipe.cook_time ?? "")}
                class="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="font-semibold mb-2">Body (Markdown)</h2>
          <p class="text-xs text-gray-500 mb-2">
            Use <code class="bg-gray-100 px-1">{"{= expression =}"}</code>{" "}
            for scalable amounts. Available variables:{" "}
            <code class="bg-gray-100 px-1">servings</code>. Functions:{" "}
            <code class="bg-gray-100 px-1">round()</code>,{" "}
            <code class="bg-gray-100 px-1">ceil()</code>,{" "}
            <code class="bg-gray-100 px-1">floor()</code>. Sub-recipes:{" "}
            <code class="bg-gray-100 px-1">@recipe(slug)</code>.
          </p>
          <textarea
            name="body"
            rows={12}
            class="w-full border rounded px-3 py-2 font-mono text-sm"
          >
            {String(recipe.body ?? "")}
          </textarea>
        </div>

        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="font-semibold mb-2">Ingredients</h2>
          <IngredientForm
            initialIngredients={ingredientData}
            groceries={groceries.map((g) => ({
              id: String(g.id),
              name: String(g.name),
              unit: String(g.unit ?? ""),
            }))}
          />
        </div>

        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="font-semibold mb-2">Devices</h2>
          <DeviceForm
            initialDevices={deviceData}
            devices={allDevices.map((d) => ({
              id: String(d.id),
              name: String(d.name),
            }))}
          />
        </div>

        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="font-semibold mb-2">Sub-recipe References</h2>
          <RefForm
            initialRefs={refData}
            recipes={allRecipes.map((r) => ({
              id: String(r.id),
              title: String(r.title),
            }))}
          />
        </div>

        <button
          type="submit"
          class="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-medium"
        >
          Save Recipe
        </button>
      </form>
    </div>
  );
});

// Simple server-rendered ref form (no island needed - just static rows + JS)
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
            class="flex-1 border rounded px-3 py-2"
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
      <p class="text-xs text-gray-500 mt-2">
        Add more references by saving and re-editing, or use @recipe(slug) in
        the body.
      </p>
    </div>
  );
}
