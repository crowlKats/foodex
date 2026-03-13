import { page } from "fresh";
import { define } from "../../utils.ts";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const handler = define.handlers({
  async GET(ctx) {
    const result = await ctx.state.db.query(
      "SELECT * FROM recipes ORDER BY updated_at DESC",
    );
    return page({ recipes: result.rows });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const title = form.get("title") as string;
    const slug = (form.get("slug") as string) || slugify(title || "");
    const description = form.get("description") as string;
    const defaultServings = parseInt(form.get("default_servings") as string) ||
      4;
    const prepTime = form.get("prep_time")
      ? parseInt(form.get("prep_time") as string)
      : null;
    const cookTime = form.get("cook_time")
      ? parseInt(form.get("cook_time") as string)
      : null;
    const body = form.get("body") as string;

    if (!title?.trim() || !slug?.trim()) {
      const result = await ctx.state.db.query(
        "SELECT * FROM recipes ORDER BY updated_at DESC",
      );
      return page({
        recipes: result.rows,
        error: "Title and slug are required",
      });
    }

    try {
      await ctx.state.db.query(
        `INSERT INTO recipes (title, slug, description, body, default_servings, prep_time, cook_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          title.trim(),
          slug.trim(),
          description?.trim() || null,
          body?.trim() || "",
          defaultServings,
          prepTime,
          cookTime,
        ],
      );
    } catch (err) {
      if (String(err).includes("unique")) {
        const result = await ctx.state.db.query(
          "SELECT * FROM recipes ORDER BY updated_at DESC",
        );
        return page({
          recipes: result.rows,
          error: `Slug "${slug}" already exists`,
        });
      }
      throw err;
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}/edit` },
    });
  },
});

export default define.page<typeof handler>(function RecipesPage({ data }) {
  const { recipes, error } = data as {
    recipes: Record<string, unknown>[];
    error?: string;
  };
  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Recipes</h1>
      </div>

      {error && (
        <div class="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-1">
          <h2 class="text-lg font-semibold mb-3">New Recipe</h2>
          <form method="POST" class="bg-white rounded-lg shadow p-4 space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                name="title"
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Slug</label>
              <input
                type="text"
                name="slug"
                placeholder="auto-generated from title"
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <textarea
                name="description"
                rows={2}
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-sm font-medium mb-1">Servings</label>
                <input
                  type="number"
                  name="default_servings"
                  value="4"
                  min="1"
                  class="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Prep (min)</label>
                <input
                  type="number"
                  name="prep_time"
                  class="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Cook (min)</label>
                <input
                  type="number"
                  name="cook_time"
                  class="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">
                Body (Markdown)
              </label>
              <textarea
                name="body"
                rows={6}
                placeholder="Use {= expression =} for scalable amounts..."
                class="w-full border rounded px-3 py-2 font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Create Recipe
            </button>
          </form>
        </div>

        <div class="lg:col-span-2">
          <h2 class="text-lg font-semibold mb-3">
            All Recipes ({recipes.length})
          </h2>
          {recipes.length === 0
            ? <p class="text-gray-500">No recipes yet.</p>
            : (
              <div class="space-y-2">
                {recipes.map((r) => (
                  <a
                    key={String(r.id)}
                    href={`/recipes/${r.slug}`}
                    class="block bg-white rounded-lg shadow p-4 hover:shadow-md transition"
                  >
                    <div class="font-medium text-lg">{String(r.title)}</div>
                    {r.description && (
                      <div class="text-sm text-gray-500 mt-1">
                        {String(r.description)}
                      </div>
                    )}
                    <div class="text-xs text-gray-400 mt-2 flex gap-4">
                      <span>{String(r.default_servings)} servings</span>
                      {r.prep_time != null && (
                        <span>Prep: {String(r.prep_time)} min</span>
                      )}
                      {r.cook_time != null && (
                        <span>Cook: {String(r.cook_time)} min</span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
});
