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
    const groceryRes = await ctx.state.db.query(
      "SELECT * FROM groceries WHERE id = $1",
      [id],
    );
    if (groceryRes.rows.length === 0) throw new HttpError(404);

    const pricesRes = await ctx.state.db.query(
      `SELECT gp.*, s.name as store_name, s.location as store_location, s.currency as store_currency
       FROM grocery_prices gp
       JOIN stores s ON s.id = gp.store_id
       WHERE gp.grocery_id = $1
       ORDER BY gp.price ASC`,
      [id],
    );

    const storesRes = await ctx.state.db.query(
      "SELECT * FROM stores ORDER BY name",
    );

    return page({
      grocery: groceryRes.rows[0],
      prices: pricesRes.rows,
      stores: storesRes.rows,
    });
  },
  async POST(ctx) {
    const id = parseInt(ctx.params.id);
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM groceries WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/groceries" },
      });
    }

    if (method === "ADD_PRICE") {
      const storeId = form.get("store_id");
      const price = form.get("price");
      const amount = form.get("amount");
      await ctx.state.db.query(
        `INSERT INTO grocery_prices (grocery_id, store_id, price, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (grocery_id, store_id)
         DO UPDATE SET price = $3, amount = $4, updated_at = now()`,
        [id, storeId, price, amount || null],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/groceries/${id}` },
      });
    }

    if (method === "DELETE_PRICE") {
      const priceId = form.get("price_id");
      await ctx.state.db.query(
        "DELETE FROM grocery_prices WHERE id = $1 AND grocery_id = $2",
        [priceId, id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/groceries/${id}` },
      });
    }

    const name = form.get("name") as string;
    const brand = form.get("brand") as string;
    const unit = form.get("unit") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/groceries/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE groceries SET name = $1, brand = $2, unit = $3 WHERE id = $4",
      [
        name.trim(),
        brand?.trim() || null,
        unit?.trim() || null,
        id,
      ],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/groceries/${id}` },
    });
  },
});

export default define.page<typeof handler>(function GroceryDetail({ data }) {
  const { grocery, prices, stores } = data as {
    grocery: Record<string, unknown>;
    prices: Record<string, unknown>[];
    stores: Record<string, unknown>[];
  };
  return (
    <div>
      <BackLink href="/groceries" label="Back to Groceries" />

      <h1 class="text-2xl font-bold mt-4">
        {String(grocery.name)}
        {grocery.unit && (
          <span class="text-stone-400 text-lg font-normal ml-2">
            ({String(grocery.unit)})
          </span>
        )}
      </h1>

      {/* Prices section - primary content */}
      <div class="mt-6">
        <h2 class="text-lg font-semibold mb-3">
          Store Prices ({prices.length})
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
                    {p.amount && (
                      <div class="text-sm text-stone-500">
                        per {String(p.amount)} {String(grocery.unit ?? "")}
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
                  <input type="hidden" name="price_id" value={String(p.id)} />
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

        <form
          method="POST"
          class="card space-y-3"
        >
          <input type="hidden" name="_method" value="ADD_PRICE" />
          <h3 class="text-sm font-semibold">Add / Update Price</h3>
          <FormField label="Store">
            <select
              name="store_id"
              required
              class="w-full"
            >
              <option value="">Select a store...</option>
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
          <button
            type="submit"
            class="btn btn-primary"
          >
            Add Price
          </button>
        </form>
      </div>

      {/* Edit grocery details */}
      <div class="mt-8">
        <h2 class="text-lg font-semibold mb-3">Edit Details</h2>
        <form
          method="POST"
          class="card space-y-3"
        >
          <div class="grid gap-3 md:grid-cols-2">
            <FormField label="Name">
              <input
                type="text"
                name="name"
                value={String(grocery.name)}
                required
                class="w-full"
              />
            </FormField>
            <FormField label="Brand">
              <input
                type="text"
                name="brand"
                value={String(grocery.brand ?? "")}
                class="w-full"
              />
            </FormField>
            <FormField label="Unit">
              <UnitSelect
                name="unit"
                value={String(grocery.unit ?? "")}
                class="w-full"
                required
              />
            </FormField>
          </div>
          <div class="flex gap-2">
            <button
              type="submit"
              class="btn btn-primary"
            >
              Save
            </button>
          </div>
        </form>

        <form method="POST" class="mt-4">
          <input type="hidden" name="_method" value="DELETE" />
          <ConfirmButton
            message="Delete this grocery and all its prices?"
            class="btn btn-danger"
          >
            Delete Grocery
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
});
