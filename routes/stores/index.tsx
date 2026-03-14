import { page } from "fresh";
import { define } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";
import { CURRENCIES } from "../../lib/currencies.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";

    let result;
    if (q) {
      result = await ctx.state.db.query(
        `SELECT s.*,
          (SELECT COUNT(*) FROM store_locations sl WHERE sl.store_id = s.id) as location_count
         FROM stores s
         LEFT JOIN store_locations sl ON sl.store_id = s.id
         WHERE s.name ILIKE '%' || $1 || '%' OR sl.address ILIKE '%' || $1 || '%'
         GROUP BY s.id
         ORDER BY s.name`,
        [q],
      );
    } else {
      result = await ctx.state.db.query(
        `SELECT s.*,
          (SELECT COUNT(*) FROM store_locations sl WHERE sl.store_id = s.id) as location_count
         FROM stores s
         ORDER BY s.name`,
      );
    }
    return page({ stores: result.rows, q });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const currency = form.get("currency") as string;
    if (!name?.trim()) {
      const result = await ctx.state.db.query(
        "SELECT * FROM stores ORDER BY name",
      );
      return page({ stores: result.rows, error: "Name is required" });
    }
    const storeRes = await ctx.state.db.query(
      "INSERT INTO stores (name, currency) VALUES ($1, $2) RETURNING id",
      [name.trim(), currency?.trim() || "EUR"],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/stores/${storeRes.rows[0].id}` },
    });
  },
});

export default define.page<typeof handler>(function StoresPage({ data }) {
  const { stores, error, q } = data as {
    stores: Record<string, unknown>[];
    error?: string;
    q: string;
  };
  return (
    <div>
      <PageHeader title="Stores" query={q} />

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <h2 class="text-lg font-semibold mb-3">Add Store</h2>
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
            <FormField label="Currency">
              <select name="currency" class="w-full">
                {CURRENCIES.map((c) => (
                  <option
                    key={c.code}
                    value={c.code}
                    selected={c.code === "EUR"}
                  >
                    {c.symbol} {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <button
              type="submit"
              class="btn btn-primary"
            >
              Add Store
            </button>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">
            All Stores ({stores.length})
          </h2>
          {stores.length === 0
            ? <p class="text-stone-500">No stores yet.</p>
            : (
              <div class="space-y-2">
                {stores.map((s) => (
                  <a
                    key={String(s.id)}
                    href={`/stores/${s.id}`}
                    class="block card card-hover"
                  >
                    <div class="font-medium">{String(s.name)}</div>
                    {Number(s.location_count) > 0 && (
                      <div class="text-sm text-stone-500">
                        {String(s.location_count)}{" "}
                        location{Number(s.location_count) !== 1 ? "s" : ""}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
});
