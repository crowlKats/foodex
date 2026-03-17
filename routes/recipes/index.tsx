import { page } from "fresh";
import { define } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { formatDuration } from "../../lib/duration.ts";
import { formatQuantity } from "../../lib/quantity.ts";
import type { RecipeQuantity } from "../../lib/quantity.ts";
import TbClock from "tb-icons/TbClock";
import TbFlame from "tb-icons/TbFlame";
import TbUsers from "tb-icons/TbUsers";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";

    let result;
    if (q) {
      result = await ctx.state.db.query(
        `SELECT DISTINCT r.*, m.url as cover_image_url, u.name as author_name FROM recipes r
         LEFT JOIN recipe_steps rs ON rs.recipe_id = r.id
         LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
         LEFT JOIN media m ON m.id = r.cover_image_id
         LEFT JOIN users u ON u.id = r.user_id
         WHERE r.search_vector @@ plainto_tsquery('english', $1)
            OR rs.body ILIKE '%' || $1 || '%'
            OR ri.name ILIKE '%' || $1 || '%'
         ORDER BY r.updated_at DESC`,
        [q],
      );
    } else {
      result = await ctx.state.db.query(
        `SELECT r.*, m.url as cover_image_url, u.name as author_name FROM recipes r
         LEFT JOIN media m ON m.id = r.cover_image_id
         LEFT JOIN users u ON u.id = r.user_id
         ORDER BY r.updated_at DESC`,
      );
    }
    return page({ recipes: result.rows, q, loggedIn: ctx.state.user != null });
  },
});

export default define.page<typeof handler>(function RecipesPage({ data }) {
  const { recipes, q, loggedIn } = data as {
    recipes: Record<string, unknown>[];
    q: string;
    loggedIn: boolean;
  };
  return (
    <div>
      <PageHeader title="Recipes" query={q}>
        {loggedIn && (
          <>
            <a
              href="/recipes/import"
              class="btn btn-outline"
            >
              Import
            </a>
            <a
              href="/recipes/new"
              class="btn btn-primary"
            >
              New Recipe
            </a>
          </>
        )}
      </PageHeader>

      <div>
        <h2 class="text-lg font-semibold mb-3">
          All Recipes ({recipes.length})
        </h2>
        {recipes.length === 0
          ? <p class="text-stone-500">No recipes yet.</p>
          : (
            <div class="space-y-2">
              {recipes.map((r) => (
                <a
                  key={String(r.id)}
                  href={`/recipes/${r.slug}`}
                  class="block card card-hover"
                >
                  <div class="flex items-center gap-3">
                    {r.cover_image_url && (
                      <img
                        src={String(r.cover_image_url)}
                        alt={String(r.title)}
                        class="w-12 h-12 object-cover rounded"
                      />
                    )}
                    <div>
                      <div class="font-medium text-lg">{String(r.title)}</div>
                      {r.description && (
                        <div class="text-sm text-stone-500 mt-1">
                          {String(r.description)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div class="text-xs text-stone-400 mt-2 flex gap-4">
                    {r.author_name && (
                      <span>by {String(r.author_name)}</span>
                    )}
                    <span>
                      <TbUsers class="size-3.5 inline mr-0.5" />
                      {formatQuantity({
                        type: String(
                          r.quantity_type || "servings",
                        ) as RecipeQuantity["type"],
                        value: Number(r.quantity_value ?? 4),
                        unit: String(r.quantity_unit || "servings"),
                        value2: r.quantity_value2 != null
                          ? Number(r.quantity_value2)
                          : undefined,
                        value3: r.quantity_value3 != null
                          ? Number(r.quantity_value3)
                          : undefined,
                        unit2: r.quantity_unit2
                          ? String(r.quantity_unit2)
                          : undefined,
                      })}
                    </span>
                    {r.prep_time != null && (
                      <span>
                        <TbClock class="size-3.5 inline mr-0.5" />Prep:{" "}
                        {formatDuration(Number(r.prep_time))}
                      </span>
                    )}
                    {r.cook_time != null && (
                      <span>
                        <TbFlame class="size-3.5 inline mr-0.5" />Cook:{" "}
                        {formatDuration(Number(r.cook_time))}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
      </div>
    </div>
  );
});
