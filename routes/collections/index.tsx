import { page } from "fresh";
import { define, escapeLike } from "../../utils.ts";
import type { CollectionWithCover } from "../../db/types.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);
    const householdId = ctx.state.householdId;

    const wheres: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    // Visible collections: owned or shared-to
    wheres.push(
      `(c.household_id = $${p} OR EXISTS (SELECT 1 FROM collection_shares cs WHERE cs.collection_id = c.id AND cs.household_id = $${p}))`,
    );
    params.push(householdId);
    p++;

    if (q) {
      const escaped = escapeLike(q);
      wheres.push(
        `(c.name ILIKE '%' || $${p} || '%' ESCAPE '\\' OR c.description ILIKE '%' || $${p} || '%' ESCAPE '\\')`,
      );
      params.push(escaped);
      p++;
    }

    const whereSql = wheres.join(" AND ");

    const [result, countRes] = await Promise.all([
      ctx.state.db.query<CollectionWithCover>(
        `SELECT c.*, m.url as cover_image_url,
                (SELECT COUNT(*) FROM collection_recipes cr WHERE cr.collection_id = c.id)::int as recipe_count
         FROM collections c
         LEFT JOIN media m ON m.id = c.cover_image_id
         WHERE ${whereSql}
         ORDER BY c.updated_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      ),
      ctx.state.db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM collections c WHERE ${whereSql}`,
        params,
      ),
    ]);
    const totalCount = Number(countRes.rows[0].cnt);

    ctx.state.pageTitle = "Collections";
    return page({
      collections: result.rows,
      q,
      currentPage,
      totalCount,
      householdId,
    });
  },
});

export default define.page<typeof handler>(
  function CollectionsPage(
    { data: { collections, q, currentPage, totalCount, householdId }, url },
  ) {
    return (
      <div>
        <PageHeader title="Collections" query={q}>
          <a href="/collections/new" class="btn btn-primary">
            New Collection
          </a>
        </PageHeader>

        {collections.length === 0
          ? <p class="text-stone-500">No collections yet.</p>
          : (
            <div class="space-y-2">
              {collections.map((c) => (
                <a
                  key={c.id}
                  href={`/collections/${c.id}`}
                  class="block card card-hover"
                >
                  <div class="flex items-center gap-3">
                    {c.cover_image_url && (
                      <img
                        src={c.cover_image_url}
                        alt={c.name}
                        class="w-12 h-12 object-cover rounded"
                      />
                    )}
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <div class="font-medium text-lg">{c.name}</div>
                        {c.private && (
                          <span class="text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded">
                            private
                          </span>
                        )}
                        {c.household_id !== householdId && (
                          <span class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            shared
                          </span>
                        )}
                      </div>
                      {c.description && (
                        <div class="text-sm text-stone-500 mt-0.5">
                          {c.description}
                        </div>
                      )}
                    </div>
                    <div class="text-sm text-stone-400 shrink-0">
                      {c.recipe_count}{" "}
                      {c.recipe_count === 1 ? "recipe" : "recipes"}
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
    );
  },
);
