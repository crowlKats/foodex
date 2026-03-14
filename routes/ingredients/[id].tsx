import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import { UnitSelect } from "../../components/UnitSelect.tsx";
import { getCurrencySymbol } from "../../lib/currencies.ts";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = parseInt(ctx.params.id);
    const ingredientRes = await ctx.state.db.query(
      "SELECT * FROM ingredients WHERE id = $1",
      [id],
    );
    if (ingredientRes.rows.length === 0) throw new HttpError(404);

    const brandsRes = await ctx.state.db.query(
      "SELECT * FROM ingredient_brands WHERE ingredient_id = $1 ORDER BY brand",
      [id],
    );

    const pricesRes = await ctx.state.db.query(
      `SELECT gp.*, s.name as store_name, s.currency as store_currency,
              ib.brand as brand_name
       FROM ingredient_prices gp
       JOIN stores s ON s.id = gp.store_id
       LEFT JOIN ingredient_brands ib ON ib.id = gp.brand_id
       WHERE gp.ingredient_id = $1
       ORDER BY ib.brand, gp.price ASC`,
      [id],
    );

    const storesRes = await ctx.state.db.query(
      "SELECT * FROM stores ORDER BY name",
    );

    return page({
      ingredient: ingredientRes.rows[0],
      brands: brandsRes.rows,
      prices: pricesRes.rows,
      stores: storesRes.rows,
    });
  },
  async POST(ctx) {
    const id = parseInt(ctx.params.id);
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM ingredients WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/ingredients" },
      });
    }

    if (method === "ADD_BRAND") {
      const brand = form.get("brand") as string;
      if (brand?.trim()) {
        await ctx.state.db.query(
          "INSERT INTO ingredient_brands (ingredient_id, brand) VALUES ($1, $2)",
          [id, brand.trim()],
        );
      }
      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${id}` },
      });
    }

    if (method === "DELETE_BRAND") {
      const brandId = form.get("brand_id");
      await ctx.state.db.query(
        "DELETE FROM ingredient_brands WHERE id = $1 AND ingredient_id = $2",
        [brandId, id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${id}` },
      });
    }

    if (method === "ADD_PRICE") {
      const storeId = form.get("store_id");
      const brandId = form.get("brand_id");
      const price = form.get("price");
      const amount = form.get("amount");
      await ctx.state.db.query(
        `INSERT INTO ingredient_prices (ingredient_id, store_id, brand_id, price, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          storeId,
          brandId || null,
          price,
          amount || null,
        ],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${id}` },
      });
    }

    if (method === "DELETE_PRICE") {
      const priceId = form.get("price_id");
      await ctx.state.db.query(
        "DELETE FROM ingredient_prices WHERE id = $1 AND ingredient_id = $2",
        [priceId, id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${id}` },
      });
    }

    const name = form.get("name") as string;
    const unit = form.get("unit") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE ingredients SET name = $1, unit = $2 WHERE id = $3",
      [name.trim(), unit?.trim() || null, id],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/ingredients/${id}` },
    });
  },
});

export default define.page<typeof handler>(function IngredientDetail({ data }) {
  const { ingredient, brands, prices, stores } = data as {
    ingredient: Record<string, unknown>;
    brands: Record<string, unknown>[];
    prices: Record<string, unknown>[];
    stores: Record<string, unknown>[];
  };
  return (
    <div>
      <BackLink href="/ingredients" label="Back to Ingredients" />

      <h1 class="text-2xl font-bold mt-4">
        {String(ingredient.name)}
        {ingredient.unit && (
          <span class="text-stone-400 text-lg font-normal ml-2">
            ({String(ingredient.unit)})
          </span>
        )}
      </h1>

      <div class="grid gap-6 lg:grid-cols-3 mt-6">
        <div class="space-y-6">
          {/* Edit details */}
          <div>
            <h2 class="text-lg font-semibold mb-3">Details</h2>
            <form method="POST" class="card space-y-3">
              <FormField label="Name">
                <input
                  type="text"
                  name="name"
                  value={String(ingredient.name)}
                  required
                  class="w-full"
                />
              </FormField>
              <FormField label="Unit">
                <UnitSelect
                  name="unit"
                  value={String(ingredient.unit ?? "")}
                  class="w-full"
                  required
                />
              </FormField>
              <button type="submit" class="btn btn-primary">Save</button>
            </form>
            <form method="POST" class="mt-3">
              <input type="hidden" name="_method" value="DELETE" />
              <ConfirmButton
                message="Delete this ingredient and all its brands/prices?"
                class="btn btn-danger"
              >
                Delete Ingredient
              </ConfirmButton>
            </form>
          </div>

          {/* Brands */}
          <div>
            <h2 class="text-lg font-semibold mb-3">
              Brands ({brands.length})
            </h2>
            {brands.length > 0 && (
              <div class="space-y-2 mb-3">
                {brands.map((b) => (
                  <div
                    key={String(b.id)}
                    class="card p-3 flex justify-between items-center"
                  >
                    <span class="text-sm font-medium">{String(b.brand)}</span>
                    <form method="POST">
                      <input
                        type="hidden"
                        name="_method"
                        value="DELETE_BRAND"
                      />
                      <input
                        type="hidden"
                        name="brand_id"
                        value={String(b.id)}
                      />
                      <button
                        type="submit"
                        class="text-red-500 hover:text-red-700 text-sm cursor-pointer"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            <form method="POST" class="flex gap-2">
              <input type="hidden" name="_method" value="ADD_BRAND" />
              <input
                type="text"
                name="brand"
                placeholder="Add brand..."
                class="flex-1"
              />
              <button type="submit" class="btn btn-primary">Add</button>
            </form>
          </div>
        </div>

        <div class="lg:col-span-2">
          {/* Prices */}
          <h2 class="text-lg font-semibold mb-3">
            Prices ({prices.length})
          </h2>

          {prices.length > 0 && (
            <div class="space-y-2 mb-4">
              {prices.map((p, i) => (
                <div
                  key={String(p.id)}
                  class={`card flex justify-between items-center ${
                    i === 0 ? "ring-2 ring-orange-400" : ""
                  }`}
                >
                  <div class="flex items-center gap-4">
                    <div class="text-xl font-bold text-orange-600">
                      {getCurrencySymbol(String(p.store_currency ?? "EUR"))}
                      {String(p.price)}
                    </div>
                    <div>
                      <a
                        href={`/stores/${p.store_id}`}
                        class="font-medium link"
                      >
                        {String(p.store_name)}
                      </a>
                      {p.brand_name && (
                        <span class="text-stone-400 ml-1">
                          ({String(p.brand_name)})
                        </span>
                      )}
                      {p.amount && (
                        <div class="text-sm text-stone-500">
                          per {String(p.amount)} {String(ingredient.unit ?? "")}
                        </div>
                      )}
                      {i === 0 && prices.length > 1 && (
                        <div class="text-xs text-orange-600 font-medium">
                          Cheapest
                        </div>
                      )}
                    </div>
                  </div>
                  <form method="POST">
                    <input type="hidden" name="_method" value="DELETE_PRICE" />
                    <input
                      type="hidden"
                      name="price_id"
                      value={String(p.id)}
                    />
                    <button
                      type="submit"
                      class="text-red-500 hover:text-red-700 text-sm cursor-pointer"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <form method="POST" class="card space-y-3">
            <input type="hidden" name="_method" value="ADD_PRICE" />
            <h3 class="text-sm font-semibold">Add Price</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FormField label="Store">
                <select name="store_id" required class="w-full">
                  <option value="">Select a store...</option>
                  {stores.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {String(s.name)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Brand">
                <select name="brand_id" class="w-full">
                  <option value="">-- No brand --</option>
                  {brands.map((b) => (
                    <option key={String(b.id)} value={String(b.id)}>
                      {String(b.brand)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FormField label="Price">
                <input
                  type="number"
                  name="price"
                  step="0.01"
                  required
                  class="w-full"
                />
              </FormField>
              <FormField label="Per amount">
                <input
                  type="number"
                  name="amount"
                  step="any"
                  placeholder="e.g. 500"
                  class="w-full"
                />
              </FormField>
            </div>
            <button type="submit" class="btn btn-primary">Add Price</button>
          </form>
        </div>
      </div>
    </div>
  );
});
