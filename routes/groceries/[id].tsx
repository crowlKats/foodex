import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = parseInt(ctx.params.id);
    const groceryRes = await ctx.state.db.query(
      "SELECT * FROM groceries WHERE id = $1",
      [id],
    );
    if (groceryRes.rows.length === 0) throw new HttpError(404);

    const pricesRes = await ctx.state.db.query(
      `SELECT gp.*, s.name as store_name, s.location as store_location
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
      const unit = form.get("unit");
      await ctx.state.db.query(
        `INSERT INTO grocery_prices (grocery_id, store_id, price, amount, unit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (grocery_id, store_id)
         DO UPDATE SET price = $3, amount = $4, unit = $5, updated_at = now()`,
        [id, storeId, price, amount || null, unit || null],
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
    const category = form.get("category") as string;
    const unit = form.get("unit") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/groceries/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE groceries SET name = $1, category = $2, unit = $3 WHERE id = $4",
      [name.trim(), category?.trim() || null, unit?.trim() || null, id],
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
      <a href="/groceries" class="text-blue-600 hover:underline text-sm">
        &larr; Back to Groceries
      </a>

      <div class="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h1 class="text-2xl font-bold mb-4">Edit Grocery</h1>
          <form
            method="POST"
            class="bg-white rounded-lg shadow p-4 space-y-3"
          >
            <div>
              <label class="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={String(grocery.name)}
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Category</label>
              <input
                type="text"
                name="category"
                value={String(grocery.category ?? "")}
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Unit</label>
              <input
                type="text"
                name="unit"
                value={String(grocery.unit ?? "")}
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <button
              type="submit"
              class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Save
            </button>
          </form>

          <form method="POST" class="mt-4">
            <input type="hidden" name="_method" value="DELETE" />
            <ConfirmButton
              message="Delete this grocery?"
              class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Delete Grocery
            </ConfirmButton>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Prices</h2>

          {prices.length > 0 && (
            <div class="space-y-2 mb-4">
              {prices.map((p) => (
                <div
                  key={String(p.id)}
                  class="bg-white rounded-lg shadow p-3 flex justify-between items-center"
                >
                  <div>
                    <a
                      href={`/stores/${p.store_id}`}
                      class="font-medium text-blue-600 hover:underline"
                    >
                      {String(p.store_name)}
                    </a>
                    <div class="text-sm text-gray-600">
                      ${String(p.price)}
                      {p.amount && (
                        <span>
                          {` / ${String(p.amount)} ${
                            String(p.unit ?? grocery.unit ?? "")
                          }`}
                        </span>
                      )}
                    </div>
                  </div>
                  <form method="POST">
                    <input type="hidden" name="_method" value="DELETE_PRICE" />
                    <input type="hidden" name="price_id" value={String(p.id)} />
                    <button
                      type="submit"
                      class="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <h3 class="text-sm font-semibold mb-2">Add Price</h3>
          <form
            method="POST"
            class="bg-white rounded-lg shadow p-4 space-y-3"
          >
            <input type="hidden" name="_method" value="ADD_PRICE" />
            <div>
              <label class="block text-sm font-medium mb-1">Store</label>
              <select
                name="store_id"
                required
                class="w-full border rounded px-3 py-2"
              >
                <option value="">Select a store...</option>
                {stores.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.name)}
                  </option>
                ))}
              </select>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-sm font-medium mb-1">Price</label>
                <input
                  type="number"
                  name="price"
                  step="0.01"
                  required
                  class="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Amount</label>
                <input
                  type="number"
                  name="amount"
                  step="0.001"
                  class="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Unit</label>
                <input
                  type="text"
                  name="unit"
                  placeholder={String(grocery.unit ?? "")}
                  class="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
            <button
              type="submit"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Add Price
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});
