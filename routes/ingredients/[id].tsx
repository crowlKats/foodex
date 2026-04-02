import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import { getCurrencySymbol } from "../../lib/currencies.ts";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";
import { toBaseUnit } from "../../lib/unit-convert.ts";
import { formatAmount, formatCurrency } from "../../lib/format.ts";
import IngredientUnitFields from "../../islands/IngredientUnitFields.tsx";
import type {
  Ingredient,
  IngredientBrand,
  IngredientPrice,
  Store,
} from "../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const id = ctx.params.id;
    const [
      ingredientRes,
      brandsRes,
      pricesRes,
      storesRes,
      otherIngredientsRes,
    ] = await Promise.all([
      ctx.state.db.query<Ingredient>(
        "SELECT * FROM ingredients WHERE id = $1",
        [id],
      ),
      ctx.state.db.query<IngredientBrand>(
        "SELECT * FROM ingredient_brands WHERE ingredient_id = $1 ORDER BY brand",
        [id],
      ),
      ctx.state.db.query<IngredientPrice>(
        `SELECT gp.*, s.name as store_name, s.currency as store_currency,
                  ib.brand as brand_name
           FROM ingredient_prices gp
           JOIN stores s ON s.id = gp.store_id
           LEFT JOIN ingredient_brands ib ON ib.id = gp.brand_id
           WHERE gp.ingredient_id = $1
           ORDER BY ib.brand, gp.price ASC`,
        [id],
      ),
      ctx.state.db.query<Store>("SELECT * FROM stores ORDER BY name"),
      ctx.state.db.query<Pick<Ingredient, "id" | "name" | "unit">>(
        "SELECT id, name, unit FROM ingredients WHERE id != $1 ORDER BY name",
        [id],
      ),
    ]);
    if (ingredientRes.rows.length === 0) throw new HttpError(404);

    const sourceRecipesRes = await ctx.state.db.query<
      { title: string; slug: string }
    >(
      "SELECT title, slug FROM recipes WHERE output_ingredient_id = $1",
      [id],
    );

    ctx.state.pageTitle = ingredientRes.rows[0].name;
    return page({
      ingredient: ingredientRes.rows[0],
      brands: brandsRes.rows,
      prices: pricesRes.rows,
      stores: storesRes.rows,
      otherIngredients: otherIngredientsRes.rows,
      sourceRecipes: sourceRecipesRes.rows,
    });
  },
  async POST(ctx) {
    const id = ctx.params.id;
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM ingredients WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/ingredients" },
      });
    }

    if (method === "MERGE") {
      const targetId = String(form.get("target_id"));
      if (!targetId || targetId === id) {
        return new Response(null, {
          status: 303,
          headers: { Location: `/ingredients/${id}` },
        });
      }

      // Reparent all references from this ingredient to the target
      await Promise.all([
        ctx.state.db.query(
          "UPDATE recipe_ingredients SET ingredient_id = $1 WHERE ingredient_id = $2",
          [targetId, id],
        ),
        ctx.state.db.query(
          "UPDATE shopping_list_items SET ingredient_id = $1 WHERE ingredient_id = $2",
          [targetId, id],
        ),
        ctx.state.db.query(
          "UPDATE pantry_items SET ingredient_id = $1 WHERE ingredient_id = $2",
          [targetId, id],
        ),
        // Move brands that don't conflict
        ctx.state.db.query(
          `UPDATE ingredient_brands SET ingredient_id = $1
           WHERE ingredient_id = $2
             AND brand NOT IN (SELECT brand FROM ingredient_brands WHERE ingredient_id = $1)`,
          [targetId, id],
        ),
        // Move prices that don't conflict on (ingredient_id, store_id)
        ctx.state.db.query(
          `UPDATE ingredient_prices SET ingredient_id = $1
           WHERE ingredient_id = $2
             AND store_id NOT IN (SELECT store_id FROM ingredient_prices WHERE ingredient_id = $1)`,
          [targetId, id],
        ),
      ]);

      // Delete the source ingredient (cascades remaining brands/prices)
      await ctx.state.db.query("DELETE FROM ingredients WHERE id = $1", [id]);

      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${targetId}` },
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

    // Convert user-friendly unit conversion to density (g/ml)
    const convAmount1 = parseFloat(form.get("conv_amount1") as string);
    const convUnit1 = form.get("conv_unit1") as string;
    const convAmount2 = parseFloat(form.get("conv_amount2") as string);
    const convUnit2 = form.get("conv_unit2") as string;
    let density: number | null = null;
    if (convAmount1 > 0 && convAmount2 > 0) {
      const mass = toBaseUnit(convAmount1, convUnit1); // → grams
      const volume = toBaseUnit(convAmount2, convUnit2); // → ml
      if (mass.unit === "g" && volume.unit === "ml" && volume.amount > 0) {
        density = mass.amount / volume.amount;
      }
    }
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/ingredients/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE ingredients SET name = $1, unit = $2, density = $3 WHERE id = $4",
      [name.trim(), unit?.trim() || null, density, id],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/ingredients/${id}` },
    });
  },
});

export default define.page<typeof handler>(
  function IngredientDetail(
    {
      data: {
        ingredient,
        brands,
        prices,
        stores,
        otherIngredients,
        sourceRecipes,
      },
    },
  ) {
    return (
      <div>
        <BackLink href="/ingredients" label="Back to Ingredients" />

        <h1 class="text-2xl font-bold mt-4 mb-6">
          {ingredient.name}
          {ingredient.unit && (
            <span class="text-stone-400 text-lg font-normal ml-2">
              ({ingredient.unit})
            </span>
          )}
        </h1>

        {sourceRecipes.length > 0 && (
          <div class="mb-4">
            <p class="text-sm text-stone-500">
              Made by: {sourceRecipes.map((r, i) => (
                <span key={r.slug}>
                  {i > 0 && ", "}
                  <a href={`/recipes/${r.slug}`} class="link">{r.title}</a>
                </span>
              ))}
            </p>
          </div>
        )}

        <div class="grid gap-6 lg:grid-cols-3">
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-3">Details</h2>
              <form method="POST" class="card space-y-3">
                <FormField label="Name">
                  <input
                    type="text"
                    name="name"
                    value={ingredient.name}
                    required
                    class="w-full"
                  />
                </FormField>
                <IngredientUnitFields
                  unit={ingredient.unit ?? ""}
                  density={ingredient.density}
                />
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

            <div>
              <h2 class="text-lg font-semibold mb-3">Merge Into</h2>
              <p class="text-xs text-stone-500 mb-3">
                Replace this ingredient with another. All recipes, pantry items,
                and shopping list references will be moved to the target. This
                ingredient will be deleted.
              </p>
              <form method="POST" class="flex gap-2">
                <input type="hidden" name="_method" value="MERGE" />
                <select name="target_id" required class="flex-1 text-sm">
                  <option value="">Select target...</option>
                  {otherIngredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.unit ? ` (${i.unit})` : ""}
                    </option>
                  ))}
                </select>
                <ConfirmButton
                  message={`Merge "${ingredient.name}" into another ingredient? This cannot be undone.`}
                  class="btn btn-danger text-sm"
                >
                  Merge
                </ConfirmButton>
              </form>
            </div>

            <div>
              <h2 class="text-lg font-semibold mb-3">
                Brands ({brands.length})
              </h2>
              {brands.length > 0 && (
                <div class="space-y-2 mb-3">
                  {brands.map((b) => (
                    <div
                      key={b.id}
                      class="card p-3 flex justify-between items-center"
                    >
                      <span class="text-sm font-medium">{b.brand}</span>
                      <form method="POST">
                        <input
                          type="hidden"
                          name="_method"
                          value="DELETE_BRAND"
                        />
                        <input
                          type="hidden"
                          name="brand_id"
                          value={b.id}
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
            <h2 class="text-lg font-semibold mb-3">
              Prices ({prices.length})
            </h2>

            {prices.length > 0 && (
              <div class="space-y-2 mb-4">
                {prices.map((p, i) => (
                  <div
                    key={p.id}
                    class={`card flex justify-between items-center ${
                      i === 0 ? "ring-2 ring-orange-400" : ""
                    }`}
                  >
                    <div class="flex items-center gap-4">
                      <div class="text-xl font-bold text-orange-600">
                        {getCurrencySymbol(p.store_currency ?? "EUR")}
                        {formatCurrency(p.price)}
                      </div>
                      <div>
                        <a
                          href={`/stores/${p.store_id}`}
                          class="font-medium link"
                        >
                          {p.store_name}
                        </a>
                        {p.brand_name && (
                          <span class="text-stone-400 ml-1">
                            ({p.brand_name})
                          </span>
                        )}
                        {p.amount && (
                          <div class="text-sm text-stone-500">
                            per {formatAmount(
                              p.amount,
                              ingredient.unit ?? undefined,
                            )} {ingredient.unit ?? ""}
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
                      <input
                        type="hidden"
                        name="_method"
                        value="DELETE_PRICE"
                      />
                      <input
                        type="hidden"
                        name="price_id"
                        value={p.id}
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
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Brand">
                  <select name="brand_id" class="w-full">
                    <option value="">-- No brand --</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.brand}
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
  },
);
