import { handler, page } from "./$audit.ts";
import { AdminNav } from "../../components/AdminNav.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_label: string;
  source: string;
  household: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string;
  detail: string | null;
  created_at: Date;
}

/** Where a log row's target can still be visited, link it. */
function targetHref(row: AuditRow): string | null {
  if (!row.target_id) return null;
  if (row.target_type === "user") return `/admin/users/${row.target_id}`;
  if (row.target_type === "household") {
    return `/admin/households/${row.target_id}`;
  }
  return null;
}

export const handlers = handler({
  async GET(ctx) {
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    const [result, countRes] = await Promise.all([
      ctx.state.db.query<AuditRow>(
        `SELECT a.*, h.name AS household
         FROM audit_log a
         LEFT JOIN households h ON h.id = a.household_id
         ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      ctx.state.db.query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM audit_log",
      ),
    ]);

    ctx.state.pageTitle = "Admin: Audit log";
    return {
      data: {
        entries: result.rows,
        currentPage,
        totalCount: Number(countRes.rows[0].cnt),
      },
    };
  },
});

function formatTime(d: Date): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const SOURCE_BADGE: Record<string, string> = {
  agent:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export default page(function AdminAuditPage(
  { data: { entries, currentPage, totalCount }, url },
) {
  return (
    <div>
      <PageHeader title="Audit log" noSearch />
      <AdminNav currentPath={url.pathname} />

      <p class="text-sm text-stone-500 mb-3">
        Every edit operation across the platform, newest first: who changed
        what, in which household, and through which surface. Entries outlive the
        accounts and records they mention.
      </p>
      {entries.length === 0
        ? (
          <EmptyState title="No edit operations recorded yet">
            Creating, editing, or deleting recipes, ingredients, stores, tools,
            collections, and households lands here as it happens, as do
            assistant applies and admin actions.
          </EmptyState>
        )
        : (
          <div class="space-y-2">
            {entries.map((e) => {
              const href = targetHref(e);
              return (
                <div key={e.id} class="card">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5 font-mono">
                      {e.action}
                    </span>
                    {e.source !== "app" && (
                      <span
                        class={`text-xs px-1.5 py-0.5 ${
                          SOURCE_BADGE[e.source] ??
                            "bg-stone-200 dark:bg-stone-700"
                        }`}
                      >
                        {e.source}
                      </span>
                    )}
                    <span class="font-medium">
                      {href
                        ? <a href={href} class="link">{e.target_label}</a>
                        : e.target_label}
                    </span>
                    <span class="text-xs text-stone-400 ml-auto">
                      {formatTime(e.created_at)}
                    </span>
                  </div>
                  <div class="text-sm text-stone-500 mt-1">
                    by {e.actor_label}
                    {e.household ? ` in ${e.household}` : ""}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      <Pagination currentPage={currentPage} totalCount={totalCount} url={url} />
    </div>
  );
});
