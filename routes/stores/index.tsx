import { page } from "fresh";
import { define, escapeLike } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";
import { CURRENCIES } from "../../lib/currencies.ts";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";
import type { StoreWithLocationCount } from "../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    let result, countRes;
    if (q) {
      const escaped = escapeLike(q);
      [result, countRes] = await Promise.all([
        ctx.state.db.query<StoreWithLocationCount>(
          `SELECT s.*,
            (SELECT COUNT(*) FROM store_locations sl WHERE sl.store_id = s.id) as location_count
           FROM stores s
           LEFT JOIN store_locations sl ON sl.store_id = s.id
           WHERE s.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR sl.address ILIKE '%' || $1 || '%' ESCAPE '\\'
           GROUP BY s.id
           ORDER BY s.name
           LIMIT $2 OFFSET $3`,
          [escaped, limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          `SELECT COUNT(DISTINCT s.id) as cnt
           FROM stores s
           LEFT JOIN store_locations sl ON sl.store_id = s.id
           WHERE s.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR sl.address ILIKE '%' || $1 || '%' ESCAPE '\\'`,
          [escaped],
        ),
      ]);
    } else {
      [result, countRes] = await Promise.all([
        ctx.state.db.query<StoreWithLocationCount>(
          `SELECT s.*,
            (SELECT COUNT(*) FROM store_locations sl WHERE sl.store_id = s.id) as location_count
           FROM stores s
           ORDER BY s.name
           LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM stores",
        ),
      ]);
    }
    const totalCount = Number(countRes.rows[0].cnt);

    const ownedStoreIds = new Set<string>();
    if (ctx.state.householdId) {
      const hsRes = await ctx.state.db.query<{ store_id: string }>(
        "SELECT store_id FROM household_stores WHERE household_id = $1",
        [ctx.state.householdId],
      );
      for (const row of hsRes.rows) {
        ownedStoreIds.add(row.store_id);
      }
    }

    const error = ctx.url.searchParams.get("error") || undefined;
    ctx.state.pageTitle = "Stores";
    return page({
      stores: result.rows,
      q,
      ownedStoreIds: [...ownedStoreIds],
      currentPage,
      totalCount,
      error,
    });
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
    const currency = form.get("currency") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/stores?error=Name+is+required" },
      });
    }
    let storeId: string;
    try {
      const storeRes = await ctx.state.db.query<{ id: string }>(
        "INSERT INTO stores (name, currency) VALUES ($1, $2) RETURNING id",
        [name.trim(), currency?.trim() || "EUR"],
      );
      storeId = storeRes.rows[0].id;
    } catch (err) {
      if (String(err).includes("unique")) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/stores?error=${
              encodeURIComponent(`Store "${name.trim()}" already exists`)
            }`,
          },
        });
      }
      throw err;
    }

    // Auto-add to household
    if (ctx.state.householdId) {
      await ctx.state.db.query(
        "INSERT INTO household_stores (household_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [ctx.state.householdId, storeId],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/stores/${storeId}` },
    });
  },
});

export default define.page<typeof handler>(
  function StoresPage(
    { data: { stores, error, q, ownedStoreIds, currentPage, totalCount }, url },
  ) {
    const ownedSet = new Set(ownedStoreIds ?? []);
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
              All Stores ({totalCount})
            </h2>
            {stores.length === 0
              ? <p class="text-stone-500">No stores yet.</p>
              : (
                <div class="space-y-2">
                  {stores.map((s) => (
                    <a
                      key={s.id}
                      href={`/stores/${s.id}`}
                      class="block card card-hover"
                    >
                      <div class="flex items-center gap-2">
                        <div class="font-medium flex-1">{s.name}</div>
                        {ownedSet.has(s.id) && (
                          <span class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded">
                            ours
                          </span>
                        )}
                      </div>
                      {s.location_count > 0 && (
                        <div class="text-sm text-stone-500">
                          {s.location_count}{" "}
                          location{s.location_count !== 1 ? "s" : ""}
                        </div>
                      )}
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
