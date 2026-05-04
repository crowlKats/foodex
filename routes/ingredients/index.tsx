import { page } from "fresh";
import { define } from "../../utils.ts";
import { UnitSelect } from "../../components/UnitSelect.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";
import { getCurrencySymbol } from "../../lib/currencies.ts";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";

const INGREDIENT_SELECT = `SELECT g.*,
  (SELECT COUNT(*) FROM ingredient_prices gp WHERE gp.ingredient_id = g.id) as store_count,
  (SELECT MIN(gp.price) FROM ingredient_prices gp WHERE gp.ingredient_id = g.id) as min_price,
  (SELECT s.name FROM ingredient_prices gp JOIN stores s ON s.id = gp.store_id
   WHERE gp.ingredient_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_store,
  (SELECT s.currency FROM ingredient_prices gp JOIN stores s ON s.id = gp.store_id
   WHERE gp.ingredient_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_currency
FROM ingredients g`;

export const handler = define.handlers({
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

    const storesRes = await ctx.state.db.query(
      "SELECT * FROM stores ORDER BY name",
    );
    const error = ctx.url.searchParams.get("error") || undefined;
    ctx.state.pageTitle = "Ingredients";
    return page({
      ingredients: result.rows,
      stores: storesRes.rows,
      q,
      currentPage,
      totalCount,
      error,
    });
  },
  async POST(ctx) {
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

    const location = action === "add_another"
      ? "/ingredients"
      : `/ingredients/${ingredientId}`;
    return new Response(null, {
      status: 303,
      headers: { Location: location },
    });
  },
});

export default define.page<typeof handler>(
  function IngredientsPage(
    { data: { ingredients, stores, error, q, currentPage, totalCount }, url },
  ) {
    return (
      <div>
        <PageHeader title="Ingredients" query={q} />

        {error && (
          <div class="alert-error mb-4">
            {error}
          </div>
        )}

        <div class="grid gap-6 lg:grid-cols-3">
          <div class="lg:col-span-1">
            <h2 class="text-lg font-semibold mb-3">Add Ingredient</h2>
            <form
              method="POST"
              class="card space-y-3"
            >
              <FormField label="Name">
                <input
                  type="text"
                  name="name"
                  required
                  class="w-full"
                />
              </FormField>
              <FormField label="Unit">
                <UnitSelect name="unit" required />
              </FormField>

              <hr class="my-2 border-stone-300 dark:border-stone-700" />
              <h3 class="text-sm font-semibold">Initial Price (optional)</h3>
              <FormField label="Store">
                <select name="store_id" class="w-full">
                  <option value="">-- No store yet --</option>
                  {stores.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {String(s.name)}
                    </option>
                  ))}
                </select>
              </FormField>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FormField label="Price">
                  <input
                    type="number"
                    name="price"
                    step="0.01"
                    class="w-full"
                  />
                </FormField>
                <FormField label="Per amount">
                  <input
                    type="number"
                    name="amount"
                    step="0.001"
                    placeholder="e.g. 500"
                    class="w-full"
                  />
                </FormField>
              </div>

              <div class="flex gap-2 flex-wrap">
                <button
                  type="submit"
                  name="action"
                  value="add_another"
                  class="btn btn-primary"
                >
                  Add, and add another
                </button>
                <button
                  type="submit"
                  name="action"
                  value="add"
                  class="btn"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          <div class="lg:col-span-2">
            <h2 class="text-lg font-semibold mb-3">
              All Ingredients ({totalCount})
            </h2>
            {ingredients.length === 0
              ? <p class="text-stone-500">No ingredients yet.</p>
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
