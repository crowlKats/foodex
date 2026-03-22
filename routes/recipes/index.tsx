import { page } from "fresh";
import { define, escapeLike } from "../../utils.ts";
import type {
  RecipeDraft,
  RecipeListItem,
  RecipeTag,
  RecipeWithCover,
} from "../../db/types.ts";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { formatDuration } from "../../lib/duration.ts";
import { formatQuantity } from "../../lib/quantity.ts";
import type { RecipeQuantity } from "../../lib/quantity.ts";
import TbClock from "tb-icons/TbClock";
import TbFlame from "tb-icons/TbFlame";
import TbHeart from "tb-icons/TbHeart";
import TbHeartFilled from "tb-icons/TbHeartFilled";
import TbUsers from "tb-icons/TbUsers";

function buildRecipeQuery(opts: {
  householdId: number | null;
  q: string;
  favoritesOnly: boolean;
  userId?: number;
  cookableOnly: boolean;
}) {
  const joins: string[] = ["LEFT JOIN media m ON m.id = r.cover_image_id"];
  const wheres: string[] = [];
  const params: unknown[] = [];
  let needsDistinct = false;
  let p = 1;

  // Visibility
  wheres.push(`(r.private = false OR r.household_id = $${p})`);
  params.push(opts.householdId);
  p++;

  // Search
  if (opts.q) {
    joins.push("LEFT JOIN recipe_steps rs ON rs.recipe_id = r.id");
    joins.push("LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id");
    wheres.push(
      `(r.search_vector @@ plainto_tsquery('english', $${p})` +
        ` OR rs.body ILIKE '%' || $${p + 1} || '%' ESCAPE '\\\\'` +
        ` OR ri.name ILIKE '%' || $${p + 1} || '%' ESCAPE '\\\\')`,
    );
    params.push(opts.q, escapeLike(opts.q));
    p += 2;
    needsDistinct = true;
  }

  // Favorites
  if (opts.favoritesOnly && opts.userId != null) {
    joins.push(
      `JOIN recipe_favorites rf ON rf.recipe_id = r.id AND rf.user_id = $${p}`,
    );
    params.push(opts.userId);
    p++;
  }

  // Cookable: every ingredient must be in pantry
  if (opts.cookableOnly && opts.householdId) {
    wheres.push(
      `NOT EXISTS (
        SELECT 1 FROM recipe_ingredients ri_ck
        WHERE ri_ck.recipe_id = r.id
          AND NOT EXISTS (
            SELECT 1 FROM pantry_items pi
            WHERE pi.household_id = $${p}
              AND (
                (ri_ck.ingredient_id IS NOT NULL AND pi.ingredient_id = ri_ck.ingredient_id)
                OR lower(pi.name) = lower(ri_ck.name)
              )
          )
      )`,
    );
    params.push(opts.householdId);
    p++;
  }

  const joinSql = joins.join("\n             ");
  const whereSql = wheres.join(" AND ");
  const distinct = needsDistinct ? "DISTINCT " : "";

  return {
    select:
      `SELECT ${distinct}r.*, m.url as cover_image_url FROM recipes r\n             ${joinSql}\n             WHERE ${whereSql}\n             ORDER BY r.updated_at DESC\n             LIMIT $${p} OFFSET $${
        p + 1
      }`,
    count: `SELECT COUNT(${
      needsDistinct ? "DISTINCT r.id" : "*"
    }) as cnt FROM recipes r\n             ${joinSql}\n             WHERE ${whereSql}`,
    params,
    limitIdx: p,
  };
}

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);
    const householdId = ctx.state.householdId;
    const favoritesOnly =
      !!(ctx.url.searchParams.get("favorites") === "1" && ctx.state.user);
    const cookableOnly =
      !!(ctx.url.searchParams.get("cookable") === "1" && ctx.state.householdId);

    const built = buildRecipeQuery({
      householdId,
      q,
      favoritesOnly,
      userId: ctx.state.user?.id,
      cookableOnly,
    });

    const [result, countRes] = await Promise.all([
      ctx.state.db.query<RecipeWithCover>(
        built.select,
        [...built.params, limit, offset],
      ),
      ctx.state.db.query<{ cnt: number }>(
        built.count,
        built.params,
      ),
    ]);
    const totalCount = countRes.rows[0].cnt;

    const recipeIds = result.rows.map((r) => r.id);
    const tagsMap: Record<number, { meal_types: string[]; dietary: string[] }> =
      {};
    if (recipeIds.length > 0) {
      const tagsRes = await ctx.state.db.query<RecipeTag>(
        "SELECT recipe_id, tag_type, tag_value FROM recipe_tags WHERE recipe_id = ANY($1)",
        [recipeIds],
      );
      for (const t of tagsRes.rows) {
        if (!tagsMap[t.recipe_id]) {
          tagsMap[t.recipe_id] = { meal_types: [], dietary: [] };
        }
        if (t.tag_type === "meal_type") {
          tagsMap[t.recipe_id].meal_types.push(t.tag_value);
        } else if (t.tag_type === "dietary") {
          tagsMap[t.recipe_id].dietary.push(t.tag_value);
        }
      }
    }
    const recipes: RecipeListItem[] = result.rows.map((r) => ({
      ...r,
      tags: tagsMap[r.id] ?? { meal_types: [], dietary: [] },
    }));

    let drafts: RecipeDraft[] = [];
    if (householdId) {
      const draftsRes = await ctx.state.db.query<RecipeDraft>(
        `SELECT id, recipe_data, source, updated_at
         FROM recipe_drafts WHERE household_id = $1
         ORDER BY updated_at DESC`,
        [householdId],
      );
      drafts = draftsRes.rows;
    }

    ctx.state.pageTitle = "Recipes";
    return page({
      recipes,
      q,
      loggedIn: ctx.state.user != null,
      currentPage,
      totalCount,
      favoritesOnly,
      cookableOnly,
      hasHousehold: !!householdId,
      drafts,
    });
  },
});

function filterUrl(base: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return `/recipes${s ? `?${s}` : ""}`;
}

export default define.page<typeof handler>(function RecipesPage({
  data: {
    recipes,
    q,
    loggedIn,
    currentPage,
    totalCount,
    favoritesOnly,
    cookableOnly,
    hasHousehold,
    drafts,
  },
  url,
}) {
  const qParam = q || undefined;
  return (
    <div>
      <PageHeader title="Recipes" query={q}>
        {loggedIn && (
          <>
            {hasHousehold && (
              <a
                href={cookableOnly
                  ? filterUrl({
                    q: qParam,
                    favorites: favoritesOnly ? "1" : undefined,
                  })
                  : filterUrl({
                    q: qParam,
                    favorites: favoritesOnly ? "1" : undefined,
                    cookable: "1",
                  })}
                class={`btn ${cookableOnly ? "btn-primary" : "btn-outline"}`}
                title={cookableOnly ? "Show all recipes" : "Show cookable now"}
              >
                Cookable
              </a>
            )}
            <a
              href={favoritesOnly
                ? filterUrl({
                  q: qParam,
                  cookable: cookableOnly ? "1" : undefined,
                })
                : filterUrl({
                  q: qParam,
                  cookable: cookableOnly ? "1" : undefined,
                  favorites: "1",
                })}
              class={`btn ${favoritesOnly ? "btn-primary" : "btn-outline"}`}
              title={favoritesOnly ? "Show all recipes" : "Show favorites"}
            >
              {favoritesOnly
                ? <TbHeartFilled class="size-4" />
                : <TbHeart class="size-4" />}
            </a>
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

      {drafts.length > 0 && (
        <div class="mb-6">
          <h2 class="text-lg font-semibold mb-3">
            Drafts ({drafts.length})
          </h2>
          <div class="space-y-2">
            {drafts.map((d) => {
              const title = (d.recipe_data as Record<string, unknown>)?.title;
              const sourceLabel = d.source === "ocr"
                ? "Imported"
                : d.source === "generate"
                ? "Generated"
                : "Manual";
              return (
                <a
                  key={d.id}
                  href={`/recipes/drafts/${d.id}`}
                  class="block card card-hover"
                >
                  <div class="flex items-center gap-3">
                    <div class="flex-1">
                      <div class="font-medium">
                        {title ? String(title) : "Untitled draft"}
                      </div>
                      <div class="text-xs text-stone-400">
                        {sourceLabel}
                        {" \u00b7 "}
                        {new Date(d.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span class="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                      draft
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <div>
        {drafts.length > 0 && (
          <h2 class="text-lg font-semibold mb-3">
            Recipes
          </h2>
        )}
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
                        src={r.cover_image_url}
                        alt={r.title}
                        class="w-12 h-12 object-cover rounded"
                      />
                    )}
                    <div>
                      <div class="font-medium text-lg">
                        {r.title}
                        {r.private && (
                          <span class="ml-2 text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded align-middle">
                            private
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <div class="text-sm text-stone-500 mt-1">
                          {r.description}
                        </div>
                      )}
                      {(r.tags.meal_types.length > 0 ||
                        r.tags.dietary.length > 0) && (
                        <div class="flex flex-wrap gap-1 mt-1">
                          {r.tags.meal_types.map((mt) => (
                            <span
                              key={mt}
                              class="text-[10px] bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded capitalize"
                            >
                              {mt}
                            </span>
                          ))}
                          {r.tags.dietary.map((dt) => (
                            <span
                              key={dt}
                              class="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded capitalize"
                            >
                              {dt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div class="text-xs text-stone-400 mt-2 flex gap-4">
                    {r.difficulty && (
                      <span class="capitalize">{r.difficulty}</span>
                    )}
                    <span>
                      <TbUsers class="size-3.5 inline mr-0.5" />
                      {formatQuantity({
                        type: (r.quantity_type || "servings") as RecipeQuantity[
                          "type"
                        ],
                        value: r.quantity_value ?? 4,
                        unit: r.quantity_unit || "servings",
                        value2: r.quantity_value2 != null
                          ? r.quantity_value2
                          : undefined,
                        value3: r.quantity_value3 != null
                          ? r.quantity_value3
                          : undefined,
                        unit2: r.quantity_unit2 ?? undefined,
                      })}
                    </span>
                    {r.prep_time != null && (
                      <span>
                        <TbClock class="size-3.5 inline mr-0.5" />Prep:{" "}
                        {formatDuration(r.prep_time)}
                      </span>
                    )}
                    {r.cook_time != null && (
                      <span>
                        <TbFlame class="size-3.5 inline mr-0.5" />Cook:{" "}
                        {formatDuration(r.cook_time)}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        <Pagination
          currentPage={currentPage}
          totalCount={totalCount}
          url={url}
        />
      </div>
    </div>
  );
});
