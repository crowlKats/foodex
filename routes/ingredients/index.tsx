import { handler, page } from "./$index.ts";
import { UnitSelect } from "../../components/UnitSelect.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { Select } from "../../components/Select.tsx";
import { getCurrencySymbol } from "../../lib/currencies.ts";
import { logAudit } from "../../lib/audit.ts";
import IngredientNameInput from "../../islands/IngredientNameInput.tsx";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./index.en.mfr";
import it from "./index.it.mfr";

const t = createT({ en, it });

const INGREDIENT_SELECT = `SELECT g.*,
  (SELECT COUNT(*) FROM ingredient_prices gp WHERE gp.ingredient_id = g.id) as store_count,
  (SELECT MIN(gp.price) FROM ingredient_prices gp WHERE gp.ingredient_id = g.id) as min_price,
  (SELECT s.name FROM ingredient_prices gp JOIN stores s ON s.id = gp.store_id
   WHERE gp.ingredient_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_store,
  (SELECT s.currency FROM ingredient_prices gp JOIN stores s ON s.id = gp.store_id
   WHERE gp.ingredient_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_currency
FROM ingredients g`;

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    let result, countRes;
    if (q) {
      [result, countRes] = await Promise.all([
        ctx.state.db.query(
          `${INGREDIENT_SELECT}
           WHERE g.search_vector @@ plainto_tsquery('english', $1)
           ORDER BY g.name LIMIT $2 OFFSET $3`,
          [q, limit, offset],
        ),
        ctx.state.db.query(
          `SELECT COUNT(*) as cnt FROM ingredients
           WHERE search_vector @@ plainto_tsquery('english', $1)`,
          [q],
        ),
      ]);
    } else {
      [result, countRes] = await Promise.all([
        ctx.state.db.query(
          `${INGREDIENT_SELECT} ORDER BY g.name LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        ctx.state.db.query("SELECT COUNT(*) as cnt FROM ingredients"),
      ]);
    }
    const totalCount = Number(countRes.rows[0].cnt);

    const [storesRes, allNamesRes] = await Promise.all([
      ctx.state.db.query("SELECT * FROM stores ORDER BY name"),
      ctx.state.db.query("SELECT id, name FROM ingredients"),
    ]);
    const error = ctx.url.searchParams.get("error") || undefined;
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "catalog.ingredients",
    ).format();
    return {
      data: {
        ingredients: result.rows,
        stores: storesRes.rows,
        existingNames: allNamesRes.rows.map((r) => ({
          id: String(r.id),
          name: String(r.name),
        })),
        q,
        currentPage,
        totalCount,
        error,
        loggedIn: ctx.state.user != null,
      },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const unit = form.get("unit") as string;
    const storeId = form.get("store_id") as string;
    const price = form.get("price") as string;
    const amount = form.get("amount") as string;
    const action = form.get("action") as string;

    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/ingredients?error=Name+is+required" },
      });
    }

    const ingredientRes = await ctx.state.db.query(
      "INSERT INTO ingredients (name, unit) VALUES ($1, $2) RETURNING id",
      [
        name.trim(),
        unit?.trim() || null,
      ],
    );
    const ingredientId = ingredientRes.rows[0].id;

    if (storeId && price) {
      await ctx.state.db.query(
        `INSERT INTO ingredient_prices (ingredient_id, store_id, price, amount)
         VALUES ($1, $2, $3, $4)`,
        [
          ingredientId,
          storeId,
          parseFloat(price),
          amount ? parseFloat(amount) : null,
        ],
      );
    }

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "ingredient.create",
      targetType: "ingredient",
      targetId: String(ingredientId),
      targetLabel: name.trim(),
      detail: storeId && price ? "with initial price" : undefined,
      householdId: ctx.state.householdId,
    });

    const location = action === "add_another"
      ? "/ingredients"
      : `/ingredients/${ingredientId}`;
    return new Response(null, {
      status: 303,
      headers: { Location: location },
    });
  },
});

export default page(
  function IngredientsPage(
    {
      data: {
        ingredients,
        stores,
        existingNames,
        error,
        q,
        currentPage,
        totalCount,
        loggedIn,
      },
      url,
    },
  ) {
    const trans = t.use();
    const sharedTrans = shared.use();
    return (
      <div>
        <PageHeader title={trans("catalog.ingredients")} query={q} />

        {error && (
          <div class="alert-error mb-4">
            {error}
          </div>
        )}

        <div
          class={`grid gap-6 ${loggedIn ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}
        >
          {loggedIn && (
            <div class="lg:col-span-1">
              <h2 class="text-lg font-semibold mb-3">
                {t("catalog.addIngredient")}
              </h2>
              <form
                method="POST"
                class="card space-y-3"
              >
                <FormField label={sharedTrans("common.name")}>
                  <IngredientNameInput existing={existingNames} />
                </FormField>
                <FormField label={sharedTrans("form.unit")}>
                  <UnitSelect name="unit" required />
                </FormField>

                <hr class="my-2 border-stone-300 dark:border-stone-700" />
                <h3 class="text-sm font-semibold">Initial Price (optional)</h3>
                <FormField label="Store">
                  <Select name="store_id" class="w-full">
                    <option value="">-- No store yet --</option>
                    {stores.map((s) => (
                      <option key={String(s.id)} value={String(s.id)}>
                        {String(s.name)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <FormField label="Price">
                    <Input
                      type="number"
                      name="price"
                      step="0.01"
                      class="w-full"
                    />
                  </FormField>
                  <FormField label="Per amount">
                    <Input
                      type="number"
                      name="amount"
                      step="0.001"
                      placeholder="e.g. 500"
                      class="w-full"
                    />
                  </FormField>
                </div>

                <div class="flex gap-2 flex-wrap">
                  <Button
                    type="submit"
                    name="action"
                    value="add_another"
                  >
                    Add, and add another
                  </Button>
                  <Button
                    type="submit"
                    name="action"
                    value="add"
                    variant="outline"
                  >
                    Add
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div class={loggedIn ? "lg:col-span-2" : ""}>
            <h2 class="text-lg font-semibold mb-3">
              {shared("common.allCount", {
                title: trans("catalog.ingredients"),
                count: String(totalCount),
              })}
            </h2>
            {ingredients.length === 0
              ? q
                ? (
                  <EmptyState
                    title={trans("empty.noIngredientsMatch", { query: q })}
                  >
                    {t("empty.noIngredientsMatchBody")}
                  </EmptyState>
                )
                : (
                  <EmptyState title={trans("empty.noIngredients")}>
                    {t("empty.noIngredientsBody")} {loggedIn
                      ? t("empty.addIngredientFirst")
                      : shared("empty.signInToAdd")}
                  </EmptyState>
                )
              : (
                <div class="space-y-2">
                  {ingredients.map((g) => (
                    <a
                      key={String(g.id)}
                      href={`/ingredients/${g.id}`}
                      class="block card card-hover"
                    >
                      <div class="flex justify-between items-start flex-wrap gap-2">
                        <div>
                          <div class="font-medium">
                            {String(g.name)}
                          </div>
                          {g.unit && (
                            <div class="text-sm text-stone-500">
                              sold by {String(g.unit)}
                            </div>
                          )}
                        </div>
                        <div class="text-right text-sm">
                          {Number(g.store_count) > 0
                            ? (
                              <div>
                                <div class="font-medium text-orange-600">
                                  from {getCurrencySymbol(
                                    String(g.cheapest_currency ?? "EUR"),
                                  )}
                                  {String(g.min_price)}
                                </div>
                                <div class="text-stone-400">
                                  {g.cheapest_store && (
                                    <span>at {String(g.cheapest_store)}</span>
                                  )}
                                  {Number(g.store_count) > 1 &&
                                    ` +${Number(g.store_count) - 1} more`}
                                </div>
                              </div>
                            )
                            : (
                              <span class="text-stone-400 italic">
                                no prices
                              </span>
                            )}
                        </div>
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
      </div>
    );
  },
);
