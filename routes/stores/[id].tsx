import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = parseInt(ctx.params.id);
    const storeRes = await ctx.state.db.query(
      "SELECT * FROM stores WHERE id = $1",
      [id],
    );
    if (storeRes.rows.length === 0) throw new HttpError(404);

    const pricesRes = await ctx.state.db.query(
      `SELECT gp.*, g.name as grocery_name, g.unit as grocery_unit
       FROM grocery_prices gp
       JOIN groceries g ON g.id = gp.grocery_id
       WHERE gp.store_id = $1
       ORDER BY g.name`,
      [id],
    );

    return page({
      store: storeRes.rows[0],
      prices: pricesRes.rows,
    });
  },
  async POST(ctx) {
    const id = parseInt(ctx.params.id);
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM stores WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/stores" },
      });
    }

    const name = form.get("name") as string;
    const location = form.get("location") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/stores/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE stores SET name = $1, location = $2 WHERE id = $3",
      [name.trim(), location?.trim() || null, id],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/stores/${id}` },
    });
  },
});

export default define.page<typeof handler>(function StoreDetail({ data }) {
  const { store, prices } = data as {
    store: Record<string, unknown>;
    prices: Record<string, unknown>[];
  };
  return (
    <div>
      <a href="/stores" class="text-blue-600 hover:underline text-sm">
        &larr; Back to Stores
      </a>

      <div class="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h1 class="text-2xl font-bold mb-4">Edit Store</h1>
          <form
            method="POST"
            class="bg-white rounded-lg shadow p-4 space-y-3"
          >
            <div>
              <label class="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={String(store.name)}
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                name="location"
                value={String(store.location ?? "")}
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div class="flex gap-2">
              <button
                type="submit"
                class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Save
              </button>
            </div>
          </form>

          <form method="POST" class="mt-4">
            <input type="hidden" name="_method" value="DELETE" />
            <ConfirmButton
              message="Delete this store?"
              class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Delete Store
            </ConfirmButton>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">
            Prices at this store ({prices.length})
          </h2>
          {prices.length === 0
            ? <p class="text-gray-500">No prices recorded.</p>
            : (
              <div class="space-y-2">
                {prices.map((p) => (
                  <div
                    key={String(p.id)}
                    class="bg-white rounded-lg shadow p-3"
                  >
                    <a
                      href={`/groceries/${p.grocery_id}`}
                      class="font-medium text-blue-600 hover:underline"
                    >
                      {String(p.grocery_name)}
                    </a>
                    <div class="text-sm text-gray-600">
                      ${String(p.price)} / {String(p.amount)}{" "}
                      {String(p.unit ?? p.grocery_unit ?? "")}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
});
