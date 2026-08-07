import { handler, page } from "./$[slug].ts";
import { HttpError } from "fresh/errors";
import type { Dish, RecipeWithCover } from "../../db/types.ts";
import { BackLink } from "../../components/BackLink.tsx";
import { Select } from "../../components/Select.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import PlanDishButton from "../../islands/PlanDishButton.tsx";
import DishCompare, { type CompareRow } from "../../islands/DishCompare.tsx";
import { formatDuration } from "../../lib/duration.ts";
import { formatQuantity } from "../../lib/quantity.ts";
import type { RecipeQuantity } from "../../lib/quantity.ts";
import { IconClock, IconFlame, IconUsers } from "@tabler/icons-preact";

type DishRecipe = RecipeWithCover & { household_name: string | null };

export const handlers = handler({
  async GET(ctx) {
    const dishRes = await ctx.state.db.query<Dish>(
      "SELECT * FROM dishes WHERE slug = $1",
      [ctx.params.slug],
    );
    if (dishRes.rows.length === 0) throw new HttpError(404);
    const dish = dishRes.rows[0];

    // The household's own recipes first, then everyone else's, oldest first.
    const recipesRes = await ctx.state.db.query<DishRecipe>(
      `SELECT r.*, m.url as cover_image_url, h.name as household_name
       FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       LEFT JOIN households h ON h.id = r.household_id
       WHERE r.dish_id = $1 AND (r.private = false OR r.household_id = $2)
       ORDER BY (r.household_id IS NOT DISTINCT FROM $2) DESC, r.created_at`,
      [dish.id, ctx.state.householdId],
    );
    if (recipesRes.rows.length === 0) throw new HttpError(404);
    const recipes = recipesRes.rows;

    const aliasRes = await ctx.state.db.query<{ norm_name: string }>(
      "SELECT norm_name FROM dish_aliases WHERE dish_id = $1",
      [dish.id],
    );
    const ownNorm = dish.name.trim().toLowerCase().replace(/\s+/g, " ");
    const aliases = aliasRes.rows
      .map((a) => a.norm_name)
      .filter((n) => n !== ownNorm);

    // Side-by-side ingredient comparison across the visible variants.
    // Rows are keyed the way stock matching keys ingredients: the linked
    // ingredient id when there is one, the normalized name otherwise.
    let compareRows: CompareRow[] = [];
    if (recipes.length > 1) {
      const ingRes = await ctx.state.db.query<{
        recipe_id: string;
        ingredient_id: string | null;
        name: string;
        amount: number | null;
        unit: string | null;
      }>(
        `SELECT ri.recipe_id, ri.ingredient_id,
                COALESCE(g.name, ri.name) AS name, ri.amount, ri.unit
         FROM recipe_ingredients ri
         LEFT JOIN ingredients g ON g.id = ri.ingredient_id
         WHERE ri.recipe_id = ANY($1)
         ORDER BY ri.sort_order, ri.id`,
        [recipes.map((r) => r.id)],
      );
      const colIndex = new Map(recipes.map((r, i) => [String(r.id), i]));
      const rows = new Map<string, CompareRow>();
      for (const ing of ingRes.rows) {
        const key = ing.ingredient_id ??
          `name:${ing.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            name: ing.name,
            cells: recipes.map(() => null),
          };
          rows.set(key, row);
        }
        const col = colIndex.get(String(ing.recipe_id));
        if (col == null) continue;
        row.cells[col] = { amount: ing.amount, unit: ing.unit };
      }
      compareRows = [...rows.values()];
    }

    // Dishes that share a word with any of this dish's names: likely the
    // same thing spelled differently, offered as merge candidates. Filtered
    // to dishes with a visible recipe so private-only titles never surface.
    const suggestionsRes = await ctx.state.db.query<{
      id: string;
      name: string;
      slug: string;
    }>(
      `WITH my_words AS (
         SELECT DISTINCT w FROM dish_aliases da,
           LATERAL regexp_split_to_table(da.norm_name, ' ') w
         WHERE da.dish_id = $1 AND length(w) >= 4
       )
       SELECT DISTINCT d.id, d.name, d.slug
       FROM dishes d
       JOIN dish_aliases a ON a.dish_id = d.id
       JOIN LATERAL regexp_split_to_table(a.norm_name, ' ') aw ON true
       JOIN my_words mw ON mw.w = aw
       WHERE d.id <> $1
         AND EXISTS (
           SELECT 1 FROM recipes r WHERE r.dish_id = d.id
             AND (r.private = false OR r.household_id = $2)
         )
       ORDER BY d.name
       LIMIT 5`,
      [dish.id, ctx.state.householdId],
    );

    // Merge targets: every other dish someone could fold this one into.
    const mergeTargetsRes = ctx.state.user
      ? await ctx.state.db.query<{ id: string; name: string }>(
        `SELECT d.id, d.name FROM dishes d
         WHERE d.id <> $1
           AND EXISTS (
             SELECT 1 FROM recipes r WHERE r.dish_id = d.id
               AND (r.private = false OR r.household_id = $2)
           )
         ORDER BY d.name`,
        [dish.id, ctx.state.householdId],
      )
      : { rows: [] as { id: string; name: string }[] };

    // The merge reassigns every recipe, private ones included; count them
    // all so the confirmation says what it actually does.
    const totalRes = await ctx.state.db.query<{ cnt: number }>(
      "SELECT COUNT(*)::int as cnt FROM recipes WHERE dish_id = $1",
      [dish.id],
    );

    ctx.state.pageTitle = dish.name;
    return {
      data: {
        dish,
        recipes,
        aliases,
        compareRows,
        suggestions: suggestionsRes.rows,
        mergeTargets: mergeTargetsRes.rows,
        totalRecipeCount: totalRes.rows[0].cnt,
        householdId: ctx.state.householdId,
        loggedIn: ctx.state.user != null,
      },
    };
  },

  async POST(ctx) {
    // Dishes are global, like ingredients: any signed-in user may curate.
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const dishRes = await ctx.state.db.query<Dish>(
      "SELECT * FROM dishes WHERE slug = $1",
      [ctx.params.slug],
    );
    if (dishRes.rows.length === 0) throw new HttpError(404);
    const dish = dishRes.rows[0];

    const form = await ctx.req.formData();
    if (form.get("_method") === "MERGE") {
      const targetId = String(form.get("target_id"));
      if (!targetId || targetId === dish.id) {
        return new Response(null, {
          status: 303,
          headers: { Location: `/dishes/${dish.slug}` },
        });
      }
      const targetRes = await ctx.state.db.query<{ slug: string }>(
        "SELECT slug FROM dishes WHERE id = $1",
        [targetId],
      );
      if (targetRes.rows.length === 0) throw new HttpError(404);

      // Everything moves, and the source's names live on as aliases of the
      // target; that is what makes the merge stick for future recipes.
      await ctx.state.db.transaction(async (q) => {
        await q(
          "UPDATE recipes SET dish_id = $1 WHERE dish_id = $2",
          [targetId, dish.id],
        );
        await q(
          "UPDATE dish_aliases SET dish_id = $1 WHERE dish_id = $2",
          [targetId, dish.id],
        );
        await q(
          "UPDATE plan_entries SET dish_id = $1 WHERE dish_id = $2",
          [targetId, dish.id],
        );
        await q("DELETE FROM dishes WHERE id = $1", [dish.id]);
      });

      return new Response(null, {
        status: 303,
        headers: { Location: `/dishes/${targetRes.rows[0].slug}` },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/dishes/${dish.slug}` },
    });
  },
});

export default page(function DishPage({
  data: {
    dish,
    recipes,
    aliases,
    compareRows,
    suggestions,
    mergeTargets,
    totalRecipeCount,
    householdId,
    loggedIn,
  },
}) {
  return (
    <div>
      <BackLink href="/recipes" label="Back to Recipes" />

      <div class="flex items-center gap-4 mt-4 mb-1 flex-wrap">
        <h1 class="text-2xl font-bold flex-1">{dish.name}</h1>
        {householdId && <PlanDishButton dishId={dish.id} />}
      </div>
      <p class="text-sm text-stone-500 mb-1">
        {recipes.length}{" "}
        {recipes.length === 1 ? "recipe makes" : "recipes make"} this dish
      </p>
      {aliases.length > 0 && (
        <p class="text-xs text-stone-400 mb-4">
          Also known as: {aliases.join(", ")}
        </p>
      )}

      <div class="space-y-2 mt-4">
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
                  {householdId != null && r.household_id === householdId && (
                    <span class="ml-2 text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded align-middle">
                      yours
                    </span>
                  )}
                </div>
                {r.household_name && (
                  <div class="text-xs text-stone-400 mt-0.5">
                    by {r.household_name}
                  </div>
                )}
                {r.description && (
                  <div class="text-sm text-stone-500 mt-1">
                    {r.description}
                  </div>
                )}
              </div>
            </div>
            <div class="text-xs text-stone-400 mt-2 flex gap-4">
              {r.difficulty && <span class="capitalize">{r.difficulty}</span>}
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
            </div>
          </a>
        ))}
      </div>

      {compareRows.length > 0 && (
        <div class="mt-8">
          <h2 class="text-lg font-semibold mb-3">Compare versions</h2>
          <DishCompare
            recipes={recipes.map((r) => ({
              id: String(r.id),
              title: r.title,
              slug: r.slug,
              quantity_type: r.quantity_type || "servings",
              quantity_value: r.quantity_value ?? 4,
              quantity_unit: r.quantity_unit || "servings",
            }))}
            rows={compareRows}
          />
        </div>
      )}

      {loggedIn && (suggestions.length > 0 || mergeTargets.length > 0) && (
        <div class="mt-8 card space-y-3">
          <h2 class="font-semibold">Same dish, different name?</h2>
          {suggestions.length > 0 && (
            <div class="text-sm">
              <p class="text-stone-500 mb-1">
                These dishes look similar. If one is the same thing, merge them
                so every version shows up together:
              </p>
              <ul class="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <a href={`/dishes/${s.slug}`} class="link">{s.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mergeTargets.length > 0 && (
            <form method="POST" class="flex items-center gap-2 flex-wrap">
              <input type="hidden" name="_method" value="MERGE" />
              <label class="text-sm text-stone-500">
                Merge "{dish.name}" into
              </label>
              <Select name="target_id" size="sm">
                {mergeTargets.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <ConfirmButton
                message={`Merge "${dish.name}" into the selected dish? This reassigns ${totalRecipeCount} ${
                  totalRecipeCount === 1 ? "recipe" : "recipes"
                } across all households, and "${dish.name}" keeps resolving to the merged dish. This cannot be undone.`}
                variant="danger"
                size="sm"
              >
                Merge
              </ConfirmButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
});
