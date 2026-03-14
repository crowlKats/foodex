import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import { CURRENCIES, getCurrencySymbol } from "../../lib/currencies.ts";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = parseInt(ctx.params.id);
    const storeRes = await ctx.state.db.query(
      "SELECT * FROM stores WHERE id = $1",
      [id],
    );
    if (storeRes.rows.length === 0) throw new HttpError(404);

    const locationsRes = await ctx.state.db.query(
      "SELECT * FROM store_locations WHERE store_id = $1 ORDER BY created_at",
      [id],
    );

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
      locations: locationsRes.rows,
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

    if (method === "ADD_LOCATION") {
      const address = form.get("address") as string;
      if (address?.trim()) {
        await ctx.state.db.query(
          "INSERT INTO store_locations (store_id, address) VALUES ($1, $2)",
          [id, address.trim()],
        );
      }
      return new Response(null, {
        status: 303,
        headers: { Location: `/stores/${id}` },
      });
    }

    if (method === "DELETE_LOCATION") {
      const locationId = form.get("location_id");
      await ctx.state.db.query(
        "DELETE FROM store_locations WHERE id = $1 AND store_id = $2",
        [locationId, id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/stores/${id}` },
      });
    }

    const name = form.get("name") as string;
    const currency = form.get("currency") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/stores/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE stores SET name = $1, currency = $2 WHERE id = $3",
      [name.trim(), currency?.trim() || "EUR", id],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/stores/${id}` },
    });
  },
});

export default define.page<typeof handler>(function StoreDetail({ data }) {
  const { store, locations, prices } = data as {
    store: Record<string, unknown>;
    locations: Record<string, unknown>[];
    prices: Record<string, unknown>[];
  };
  return (
    <div>
      <BackLink href="/stores" label="Back to Stores" />

      <div class="mt-4 grid gap-6 lg:grid-cols-3">
        <div class="space-y-4">
          <div>
            <h1 class="text-2xl font-bold mb-4">Edit Store</h1>
            <form
              method="POST"
              class="card space-y-3"
            >
              <FormField label="Name">
                <input
                  type="text"
                  name="name"
                  value={String(store.name)}
                  required
                  class="w-full"
                />
              </FormField>
              <FormField label="Currency">
                <select name="currency" class="w-full">
                  {CURRENCIES.map((c) => (
                    <option
                      key={c.code}
                      value={c.code}
                      selected={c.code === String(store.currency ?? "EUR")}
                    >
                      {c.symbol} {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
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
                message="Delete this store?"
                class="btn btn-danger"
              >
                Delete Store
              </ConfirmButton>
            </form>
          </div>

          <div>
            <h2 class="text-lg font-semibold mb-3">
              Locations ({locations.length})
            </h2>
            {locations.length > 0 && (
              <div class="space-y-2 mb-3">
                {locations.map((loc) => (
                  <div
                    key={String(loc.id)}
                    class="card p-3 flex justify-between items-center"
                  >
                    <span class="text-sm">{String(loc.address)}</span>
                    <form method="POST">
                      <input
                        type="hidden"
                        name="_method"
                        value="DELETE_LOCATION"
                      />
                      <input
                        type="hidden"
                        name="location_id"
                        value={String(loc.id)}
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
              <input type="hidden" name="_method" value="ADD_LOCATION" />
              <input
                type="text"
                name="address"
                placeholder="Add address..."
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
          {prices.length === 0
            ? <p class="text-stone-500">No prices recorded.</p>
            : (
              <div class="space-y-2">
                {prices.map((p) => (
                  <div
                    key={String(p.id)}
                    class="card p-3"
                  >
                    <a
                      href={`/groceries/${p.grocery_id}`}
                      class="font-medium link"
                    >
                      {String(p.grocery_name)}
                    </a>
                    <div class="text-sm text-stone-600">
                      {getCurrencySymbol(String(store.currency ?? "EUR"))}
                      {String(p.price)}
                      {p.amount &&
                        ` / ${String(p.amount)} ${
                          String(p.grocery_unit ?? "")
                        }`}
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
