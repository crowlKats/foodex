import { page } from "fresh";
import { define } from "../../utils.ts";
import { UnitSelect } from "../../components/UnitSelect.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";
import { getCurrencySymbol } from "../../lib/currencies.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";

    // Fetch groceries with their cheapest price and store count
    let result;
    if (q) {
      result = await ctx.state.db.query(
        `SELECT g.*,
          (SELECT COUNT(*) FROM grocery_prices gp WHERE gp.grocery_id = g.id) as store_count,
          (SELECT MIN(gp.price) FROM grocery_prices gp WHERE gp.grocery_id = g.id) as min_price,
          (SELECT s.name FROM grocery_prices gp JOIN stores s ON s.id = gp.store_id
           WHERE gp.grocery_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_store,
          (SELECT s.currency FROM grocery_prices gp JOIN stores s ON s.id = gp.store_id
           WHERE gp.grocery_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_currency
         FROM groceries g
         WHERE g.search_vector @@ plainto_tsquery('english', $1)
         ORDER BY g.name`,
        [q],
      );
    } else {
      result = await ctx.state.db.query(
        `SELECT g.*,
          (SELECT COUNT(*) FROM grocery_prices gp WHERE gp.grocery_id = g.id) as store_count,
          (SELECT MIN(gp.price) FROM grocery_prices gp WHERE gp.grocery_id = g.id) as min_price,
          (SELECT s.name FROM grocery_prices gp JOIN stores s ON s.id = gp.store_id
           WHERE gp.grocery_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_store,
          (SELECT s.currency FROM grocery_prices gp JOIN stores s ON s.id = gp.store_id
           WHERE gp.grocery_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_currency
         FROM groceries g
         ORDER BY g.name`,
      );
    }
    const storesRes = await ctx.state.db.query(
      "SELECT * FROM stores ORDER BY name",
    );
    return page({ groceries: result.rows, stores: storesRes.rows, q });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const brand = form.get("brand") as string;
    const unit = form.get("unit") as string;
    const storeId = form.get("store_id") as string;
    const price = form.get("price") as string;
    const amount = form.get("amount") as string;

    if (!name?.trim()) {
      const result = await ctx.state.db.query(
        `SELECT g.*,
          (SELECT COUNT(*) FROM grocery_prices gp WHERE gp.grocery_id = g.id) as store_count,
          (SELECT MIN(gp.price) FROM grocery_prices gp WHERE gp.grocery_id = g.id) as min_price,
          (SELECT s.name FROM grocery_prices gp JOIN stores s ON s.id = gp.store_id
           WHERE gp.grocery_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_store,
          (SELECT s.currency FROM grocery_prices gp JOIN stores s ON s.id = gp.store_id
           WHERE gp.grocery_id = g.id ORDER BY gp.price ASC LIMIT 1) as cheapest_currency
         FROM groceries g ORDER BY g.name`,
      );
      const storesRes = await ctx.state.db.query(
        "SELECT * FROM stores ORDER BY name",
      );
      return page({
        groceries: result.rows,
        stores: storesRes.rows,
        error: "Name is required",
      });
    }

    const groceryRes = await ctx.state.db.query(
      "INSERT INTO groceries (name, brand, unit) VALUES ($1, $2, $3) RETURNING id",
      [
        name.trim(),
        brand?.trim() || null,
        unit?.trim() || null,
      ],
    );
    const groceryId = groceryRes.rows[0].id;

    // If a store and price were provided, add the price entry
    if (storeId && price) {
      await ctx.state.db.query(
        `INSERT INTO grocery_prices (grocery_id, store_id, price, amount)
         VALUES ($1, $2, $3, $4)`,
        [
          groceryId,
          parseInt(storeId),
          parseFloat(price),
          amount ? parseFloat(amount) : null,
        ],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/groceries/${groceryId}` },
    });
  },
});

export default define.page<typeof handler>(function GroceriesPage({ data }) {
  const { groceries, stores, error, q } = data as {
    groceries: Record<string, unknown>[];
    stores: Record<string, unknown>[];
    error?: string;
    q: string;
  };

  return (
    <div>
      <PageHeader title="Groceries" query={q} />

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-1">
          <h2 class="text-lg font-semibold mb-3">Add Grocery</h2>
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
            <FormField label="Brand">
              <input
                type="text"
                name="brand"
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

            <button
              type="submit"
              class="btn btn-primary"
            >
              Add Grocery
            </button>
          </form>
        </div>

        <div class="lg:col-span-2">
          <h2 class="text-lg font-semibold mb-3">
            All Groceries ({groceries.length})
          </h2>
          {groceries.length === 0
            ? <p class="text-stone-500">No groceries yet.</p>
            : (
              <div class="space-y-2">
                {groceries.map((g) => (
                  <a
                    key={String(g.id)}
                    href={`/groceries/${g.id}`}
                    class="block card card-hover"
                  >
                    <div class="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <div class="font-medium">
                          {String(g.name)}
                          {g.brand && (
                            <span class="text-stone-400 font-normal ml-1">
                              ({String(g.brand)})
                            </span>
                          )}
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
        </div>
      </div>
    </div>
  );
});
