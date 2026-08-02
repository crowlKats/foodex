import { handler, page } from "./$index.ts";
import { escapeLike } from "../../utils.ts";
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
import { ButtonLink } from "../../components/Button.tsx";
import { formatDuration } from "../../lib/duration.ts";
import { formatQuantity } from "../../lib/quantity.ts";
import type { RecipeQuantity } from "../../lib/quantity.ts";
import {
  DIETARY_TAGS,
  DIFFICULTY_LEVELS,
  MEAL_TYPES,
} from "../../lib/recipe-tags.ts";
import { IconClock } from "@tabler/icons-preact";
import { IconFlame } from "@tabler/icons-preact";
import { IconZzz } from "@tabler/icons-preact";
import { IconUsers } from "@tabler/icons-preact";
import { IconFilter } from "@tabler/icons-preact";
import { IconX } from "@tabler/icons-preact";
import SortSelect from "../../islands/SortSelect.tsx";

const SORT_OPTIONS = [
  {
    value: "newest",
    label: "Newest",
    column: "r.created_at",
    defaultDesc: true,
  },
  {
    value: "alphabetical",
    label: "A\u2013Z",
    column: "r.title",
    defaultDesc: false,
  },
  {
    value: "quickest",
    label: "Total Time",
    column:
      "COALESCE(r.prep_time, 0) + COALESCE(r.cook_time, 0) + COALESCE(r.rest_time, 0)",
    defaultDesc: false,
  },
  {
    value: "fewest-ingredients",
    label: "Ingredients",
    column:
      "(SELECT COUNT(*) FROM recipe_ingredients ri_s WHERE ri_s.recipe_id = r.id)",
    defaultDesc: false,
  },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function buildRecipeQuery(opts: {
  householdId: string | null;
  q: string;
  favoritesOnly: boolean;
  userId?: string;
  cookableOnly: boolean;
  difficulty: string[];
  mealTypes: string[];
  dietary: string[];
  sort: SortValue;
  desc: boolean;
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
        ` OR rs.body ILIKE '%' || $${p + 1} || '%' ESCAPE '\\'` +
        ` OR ri.name ILIKE '%' || $${p + 1} || '%' ESCAPE '\\')`,
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

  // Cookable: the pantry must cover every ingredient, and the household must
  // own every tool. This mirrors isAvailable() in lib/inventory.ts — stock with
  // an untracked amount counts, a staple always counts, and a tracked amount
  // that falls short does not. It used to ignore amounts entirely, so "cookable"
  // included recipes you had a single gram of flour for.
  if (opts.cookableOnly && opts.householdId) {
    wheres.push(
      `NOT EXISTS (
        SELECT 1 FROM recipe_ingredients ri_ck
        WHERE ri_ck.recipe_id = r.id
          AND NOT ri_ck.always_on_hand
          AND COALESCE((
            SELECT
              -- Staples and untracked amounts cover any requirement; otherwise
              -- the stock has to add up across every matching row.
              BOOL_OR(pi.staple OR pi.amount IS NULL)
              OR SUM(
                   COALESCE(
                     fx_convert(pi.amount, pi.unit, ri_ck.unit, gi.density),
                     0
                   )
                 ) >= COALESCE(ri_ck.amount, 0)
            FROM pantry_items pi
            LEFT JOIN ingredients gi ON gi.id = pi.ingredient_id
            WHERE pi.household_id = $${p}
              AND (
                (ri_ck.ingredient_id IS NOT NULL
                  AND pi.ingredient_id = ri_ck.ingredient_id)
                OR fx_norm_name(pi.name) = fx_norm_name(ri_ck.name)
              )
          ), false) = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM recipe_tools rt_ck
        WHERE rt_ck.recipe_id = r.id
          AND NOT EXISTS (
            SELECT 1 FROM household_tools ht
            WHERE ht.household_id = $${p} AND ht.tool_id = rt_ck.tool_id
          )
      )`,
    );
    params.push(opts.householdId);
    p++;
  }

  // Difficulty filter
  if (opts.difficulty.length > 0) {
    wheres.push(`r.difficulty = ANY($${p})`);
    params.push(opts.difficulty);
    p++;
  }

  // Meal type filter (recipe must have ALL selected meal types)
  for (const mt of opts.mealTypes) {
    wheres.push(
      `EXISTS (SELECT 1 FROM recipe_tags rt WHERE rt.recipe_id = r.id AND rt.tag_type = 'meal_type' AND rt.tag_value = $${p})`,
    );
    params.push(mt);
    p++;
  }

  // Dietary filter (recipe must have ALL selected dietary tags)
  for (const dt of opts.dietary) {
    wheres.push(
      `EXISTS (SELECT 1 FROM recipe_tags rt WHERE rt.recipe_id = r.id AND rt.tag_type = 'dietary' AND rt.tag_value = $${p})`,
    );
    params.push(dt);
    p++;
  }

  const joinSql = joins.join("\n             ");
  const whereSql = wheres.join(" AND ");
  const distinct = needsDistinct ? "DISTINCT " : "";

  const sortOpt = SORT_OPTIONS.find((o) => o.value === opts.sort) ??
    SORT_OPTIONS[0];
  const dir = opts.desc ? "DESC" : "ASC";
  const orderSql = `${sortOpt.column} ${dir}, r.title ${dir}`;

  return {
    select:
      `SELECT ${distinct}r.*, m.url as cover_image_url FROM recipes r\n             ${joinSql}\n             WHERE ${whereSql}\n             ORDER BY ${orderSql}\n             LIMIT $${p} OFFSET $${
        p + 1
      }`,
    // ::int so `cnt` arrives as a number — pg hands back bigint as a string,
    // which quietly defeats any `=== 0` comparison on the result.
    count: `SELECT COUNT(${
      needsDistinct ? "DISTINCT r.id" : "*"
    })::int as cnt FROM recipes r\n             ${joinSql}\n             WHERE ${whereSql}`,
    params,
    limitIdx: p,
  };
}

/** Parse a multi-value param (comma-separated or repeated keys), validated against allowed values. */
function parseMultiParam(
  url: URL,
  key: string,
  allowed: readonly string[],
): string[] {
  const vals = url.searchParams.getAll(key).flatMap((v) => v.split(","));
  const set = new Set(allowed);
  return vals.filter((v) => set.has(v));
}

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);
    const householdId = ctx.state.householdId;
    const favoritesOnly =
      !!(ctx.url.searchParams.get("favorites") === "1" && ctx.state.user);
    const cookableOnly =
      !!(ctx.url.searchParams.get("cookable") === "1" && ctx.state.householdId);

    const difficulty = parseMultiParam(
      ctx.url,
      "difficulty",
      DIFFICULTY_LEVELS,
    );
    const mealTypes = parseMultiParam(ctx.url, "meal_type", MEAL_TYPES);
    const dietary = parseMultiParam(ctx.url, "dietary", DIETARY_TAGS);
    const sortParam = ctx.url.searchParams.get("sort") ?? "newest";
    const sort: SortValue = SORT_OPTIONS.some((o) => o.value === sortParam)
      ? (sortParam as SortValue)
      : "newest";
    const sortOption = SORT_OPTIONS.find((o) => o.value === sort) ??
      SORT_OPTIONS[0];
    const descParam = ctx.url.searchParams.get("desc");
    const desc = descParam !== null
      ? descParam === "1"
      : sortOption.defaultDesc;

    const built = buildRecipeQuery({
      householdId,
      q,
      favoritesOnly,
      userId: ctx.state.user?.id,
      cookableOnly,
      difficulty,
      mealTypes,
      dietary,
      sort,
      desc,
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

    // "Ready to make" returning nothing usually means the pantry is empty, not
    // that no recipe matched. Only asked when it could change the empty state.
    const pantryIsEmpty = cookableOnly && totalCount === 0 && householdId
      ? (await ctx.state.db.query<{ cnt: number }>(
        "SELECT COUNT(*)::int AS cnt FROM pantry_items WHERE household_id = $1",
        [householdId],
      )).rows[0].cnt === 0
      : false;

    const recipeIds = result.rows.map((r) => r.id);

    const [tagsRows, drafts] = await Promise.all([
      recipeIds.length > 0
        ? ctx.state.db.query<RecipeTag>(
          "SELECT recipe_id, tag_type, tag_value FROM recipe_tags WHERE recipe_id = ANY($1)",
          [recipeIds],
        ).then((r) => r.rows)
        : Promise.resolve([] as RecipeTag[]),
      householdId
        ? ctx.state.db.query<RecipeDraft>(
          `SELECT id, recipe_data, source, updated_at
           FROM recipe_drafts WHERE household_id = $1
           ORDER BY updated_at DESC`,
          [householdId],
        ).then((r) => r.rows)
        : Promise.resolve([] as RecipeDraft[]),
    ]);

    const tagsMap: Record<string, { meal_types: string[]; dietary: string[] }> =
      {};
    for (const t of tagsRows) {
      if (!tagsMap[t.recipe_id]) {
        tagsMap[t.recipe_id] = { meal_types: [], dietary: [] };
      }
      if (t.tag_type === "meal_type") {
        tagsMap[t.recipe_id].meal_types.push(t.tag_value);
      } else if (t.tag_type === "dietary") {
        tagsMap[t.recipe_id].dietary.push(t.tag_value);
      }
    }
    const recipes: RecipeListItem[] = result.rows.map((r) => ({
      ...r,
      tags: tagsMap[r.id] ?? { meal_types: [], dietary: [] },
    }));

    ctx.state.pageTitle = "Recipes";
    return {
      data: {
        recipes,
        q,
        loggedIn: ctx.state.user != null,
        currentPage,
        totalCount,
        favoritesOnly,
        cookableOnly,
        pantryIsEmpty,
        hasHousehold: !!householdId,
        drafts,
        difficulty,
        mealTypes,
        dietary,
        sort,
        desc,
      },
    };
  },
});

/** Build a URL preserving all current filter state, with overrides applied. */
function filterUrl(
  current: {
    q?: string;
    favorites?: boolean;
    cookable?: boolean;
    difficulty?: string[];
    mealTypes?: string[];
    dietary?: string[];
    sort?: SortValue;
    desc?: boolean;
  },
  overrides: Record<string, string | string[] | undefined>,
): string {
  const p = new URLSearchParams();
  // Merge current state
  if (current.q) p.set("q", current.q);
  if (current.favorites) p.set("favorites", "1");
  if (current.cookable) p.set("cookable", "1");
  if (current.sort && current.sort !== "newest") p.set("sort", current.sort);
  if (current.desc !== undefined) {
    const defaultDesc = SORT_OPTIONS.find((o) => o.value === current.sort)
      ?.defaultDesc ?? true;
    if (current.desc !== defaultDesc) p.set("desc", current.desc ? "1" : "0");
  }
  for (const v of current.difficulty ?? []) p.append("difficulty", v);
  for (const v of current.mealTypes ?? []) p.append("meal_type", v);
  for (const v of current.dietary ?? []) p.append("dietary", v);
  // Apply overrides (undefined = remove, string = set, string[] = replace all)
  for (const [k, v] of Object.entries(overrides)) {
    p.delete(k);
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const val of v) p.append(k, val);
    } else {
      p.set(k, v);
    }
  }
  // Always reset to page 1 when filters change
  p.delete("page");
  const s = p.toString();
  return `/recipes${s ? `?${s}` : ""}`;
}

function FilterChip(
  { label, href, active }: { label: string; href: string; active: boolean },
) {
  return (
    <a
      href={href}
      class={`inline-block text-xs px-2 py-1 rounded-full border transition-colors capitalize ${
        active
          ? "bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
          : "border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500"
      }`}
    >
      {label}
    </a>
  );
}

export default page(function RecipesPage({
  data: {
    recipes,
    q,
    loggedIn,
    currentPage,
    totalCount,
    favoritesOnly,
    cookableOnly,
    pantryIsEmpty,
    hasHousehold,
    drafts,
    difficulty,
    mealTypes,
    dietary,
    sort,
    desc,
  },
  url,
}) {
  const current = {
    q: q || undefined,
    favorites: favoritesOnly,
    cookable: cookableOnly,
    difficulty,
    mealTypes,
    dietary,
    sort,
    desc,
  };

  const hasFilters = difficulty.length > 0 || mealTypes.length > 0 ||
    dietary.length > 0 || favoritesOnly || cookableOnly;

  /**
   * "No recipes found." was the same sentence whether the catalog was empty,
   * a search matched nothing, or the pantry-aware filter had nothing to work
   * with — which is the case that actually needs explaining.
   */
  function renderEmptyState() {
    const clearHref = filterUrl(current, {
      difficulty: undefined,
      meal_type: undefined,
      dietary: undefined,
      favorites: undefined,
      cookable: undefined,
    });

    if (cookableOnly && pantryIsEmpty) {
      return (
        <div class="card text-center py-8 space-y-2">
          <p class="font-medium">Nothing is ready to make yet</p>
          <p class="text-stone-500 text-sm">
            "Ready to make" only shows recipes your pantry already covers, and
            your pantry is empty.
          </p>
          <div class="flex flex-wrap gap-2 justify-center pt-1">
            <ButtonLink href="/household/pantry" size="sm">
              Stock the pantry
            </ButtonLink>
            <ButtonLink href={clearHref} variant="outline" size="sm">
              Show all recipes
            </ButtonLink>
          </div>
        </div>
      );
    }

    if (q) {
      return (
        <div class="card text-center py-8 space-y-2">
          <p class="font-medium">No recipes match "{q}"</p>
          <p class="text-stone-500 text-sm">
            Try a shorter search{hasFilters ? ", or clear the filters" : ""}.
          </p>
          {hasFilters && (
            <div class="pt-1">
              <ButtonLink href={clearHref} variant="outline" size="sm">
                Clear all filters
              </ButtonLink>
            </div>
          )}
        </div>
      );
    }

    if (hasFilters) {
      return (
        <div class="card text-center py-8 space-y-2">
          <p class="font-medium">No recipes match these filters</p>
          <p class="text-stone-500 text-sm">
            Nothing in the collection fits every filter you've picked.
          </p>
          <div class="pt-1">
            <ButtonLink href={clearHref} variant="outline" size="sm">
              Clear all filters
            </ButtonLink>
          </div>
        </div>
      );
    }

    return (
      <div class="card text-center py-8 space-y-2">
        <p class="font-medium">No recipes yet</p>
        <p class="text-stone-500 text-sm">
          Write one from scratch, or import one from a URL, a photo or a block
          of text.
        </p>
        {loggedIn && (
          <div class="flex flex-wrap gap-2 justify-center pt-1">
            <ButtonLink href="/recipes/new" size="sm">New recipe</ButtonLink>
            <ButtonLink href="/recipes/import" variant="outline" size="sm">
              Import
            </ButtonLink>
          </div>
        )}
      </div>
    );
  }

  function toggleArrayFilter(
    key: string,
    value: string,
    arr: string[],
  ): string {
    const next = arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
    return filterUrl(current, { [key]: next.length > 0 ? next : undefined });
  }

  return (
    <div>
      <PageHeader title="Recipes" query={q}>
        {loggedIn && (
          <>
            <ButtonLink href="/recipes/import" variant="outline">
              Import
            </ButtonLink>
            <ButtonLink href="/recipes/new">
              New Recipe
            </ButtonLink>
          </>
        )}
      </PageHeader>

      {
        /*
        The summary keeps its default `list-item` display: Chrome drops a
        summary's implicit role when `display` is changed, which left the
        control exposed as a bare `generic` with no role and no expanded
        state. The flex row lives in a child instead. The sort control moved
        out of the summary for the same reason — a control nested inside a
        summary toggles the disclosure when you click it.
      */
      }
      <div class="mb-4 flex items-start gap-3">
        <details
          class="flex-1 min-w-0 group"
          open={hasFilters || undefined}
        >
          <summary class="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-sm text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
            <span class="inline-flex items-center gap-1.5">
              <IconFilter class="size-4" />
              <span>Filters</span>
              {hasFilters && (
                <span class="count-badge count-badge-soft">
                  {difficulty.length + mealTypes.length + dietary.length +
                    (favoritesOnly ? 1 : 0) + (cookableOnly ? 1 : 0)}
                </span>
              )}
            </span>
          </summary>
          <div class="mt-4 card space-y-3">
            {loggedIn && (
              <div>
                <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                  Show only
                </div>
                <div class="flex flex-wrap gap-1.5">
                  {hasHousehold && (
                    <FilterChip
                      label="Ready to make"
                      active={cookableOnly}
                      href={filterUrl(current, {
                        cookable: cookableOnly ? undefined : "1",
                      })}
                    />
                  )}
                  <FilterChip
                    label="Favourites"
                    active={favoritesOnly}
                    href={filterUrl(current, {
                      favorites: favoritesOnly ? undefined : "1",
                    })}
                  />
                </div>
              </div>
            )}
            <div>
              <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                Difficulty
              </div>
              <div class="flex flex-wrap gap-1.5">
                {DIFFICULTY_LEVELS.map((d) => (
                  <FilterChip
                    key={d}
                    label={d}
                    active={difficulty.includes(d)}
                    href={toggleArrayFilter("difficulty", d, difficulty)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                Meal Type
              </div>
              <div class="flex flex-wrap gap-1.5">
                {MEAL_TYPES.map((mt) => (
                  <FilterChip
                    key={mt}
                    label={mt}
                    active={mealTypes.includes(mt)}
                    href={toggleArrayFilter("meal_type", mt, mealTypes)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                Dietary
              </div>
              <div class="flex flex-wrap gap-1.5">
                {DIETARY_TAGS.map((dt) => (
                  <FilterChip
                    key={dt}
                    label={dt}
                    active={dietary.includes(dt)}
                    href={toggleArrayFilter("dietary", dt, dietary)}
                  />
                ))}
              </div>
            </div>
            {hasFilters && (
              <a
                href={filterUrl(current, {
                  difficulty: undefined,
                  meal_type: undefined,
                  dietary: undefined,
                  favorites: undefined,
                  cookable: undefined,
                })}
                class="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
              >
                <IconX class="size-3.5" />
                Clear all filters
              </a>
            )}
          </div>
        </details>
        <SortSelect
          current={sort}
          desc={desc}
          toggleHref={filterUrl(current, {
            desc: desc ? "0" : "1",
          })}
          options={SORT_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
            href: filterUrl(current, {
              sort: o.value === "newest" ? undefined : o.value,
              desc: undefined,
            }),
          }))}
        />
      </div>

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
        {recipes.length === 0 ? renderEmptyState() : (
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
                    <IconUsers class="size-3.5 inline mr-0.5" />
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
                      <IconClock class="size-3.5 inline mr-0.5" />Prep:{" "}
                      {formatDuration(r.prep_time)}
                    </span>
                  )}
                  {r.cook_time != null && (
                    <span>
                      <IconFlame class="size-3.5 inline mr-0.5" />Cook:{" "}
                      {formatDuration(r.cook_time)}
                    </span>
                  )}
                  {r.rest_time != null && (
                    <span>
                      <IconZzz class="size-3.5 inline mr-0.5" />Rest:{" "}
                      {formatDuration(r.rest_time)}
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
