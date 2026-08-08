import { handler, page } from "./$audit.ts";
import { AdminNav } from "../../components/AdminNav.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { FilterChip } from "../../components/FilterChip.tsx";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { escapeLike } from "../../utils.ts";
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
  household_id: string | null;
  household: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string;
  detail: string | null;
  created_at: Date;
}

/** Filter state, all optional; empty string means "not filtering on this". */
interface AuditFilters {
  q: string;
  type: string;
  source: string;
  action: string;
  actor: string;
  household: string;
  from: string;
  to: string;
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
    const sp = ctx.url.searchParams;

    const date = (name: string) => {
      const v = sp.get(name)?.trim() ?? "";
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
    };
    const filters: AuditFilters = {
      q: sp.get("q")?.trim() || "",
      type: sp.get("type")?.trim() || "",
      source: sp.get("source")?.trim() || "",
      action: sp.get("action")?.trim() || "",
      actor: sp.get("actor")?.trim() || "",
      household: /^[0-9a-f-]{36}$/i.test(sp.get("household") ?? "")
        ? sp.get("household")!
        : "",
      from: date("from"),
      to: date("to"),
    };

    const wheres: string[] = [];
    const params: unknown[] = [];
    const add = (clause: (n: number) => string, value: unknown) => {
      params.push(value);
      wheres.push(clause(params.length));
    };
    if (filters.q) {
      add(
        (n) =>
          `(a.action ILIKE '%' || $${n} || '%' ESCAPE '\\'
            OR a.target_label ILIKE '%' || $${n} || '%' ESCAPE '\\'
            OR a.actor_label ILIKE '%' || $${n} || '%' ESCAPE '\\'
            OR a.detail ILIKE '%' || $${n} || '%' ESCAPE '\\'
            OR h.name ILIKE '%' || $${n} || '%' ESCAPE '\\')`,
        escapeLike(filters.q),
      );
    }
    if (filters.type) add((n) => `a.target_type = $${n}`, filters.type);
    if (filters.source) add((n) => `a.source = $${n}`, filters.source);
    if (filters.action) add((n) => `a.action = $${n}`, filters.action);
    if (filters.actor) add((n) => `a.actor_label = $${n}`, filters.actor);
    if (filters.household) {
      add((n) => `a.household_id = $${n}`, filters.household);
    }
    if (filters.from) add((n) => `a.created_at >= $${n}::date`, filters.from);
    if (filters.to) {
      add((n) => `a.created_at < $${n}::date + interval '1 day'`, filters.to);
    }
    const where = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

    const [result, countRes, typesRes, sourcesRes] = await Promise.all([
      ctx.state.db.query<AuditRow>(
        `SELECT a.*, h.name AS household
         FROM audit_log a
         LEFT JOIN households h ON h.id = a.household_id
         ${where}
         ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${
          params.length + 2
        }`,
        [...params, limit, offset],
      ),
      ctx.state.db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt
         FROM audit_log a
         LEFT JOIN households h ON h.id = a.household_id
         ${where}`,
        params,
      ),
      ctx.state.db.query<{ target_type: string }>(
        "SELECT DISTINCT target_type FROM audit_log ORDER BY target_type",
      ),
      ctx.state.db.query<{ source: string }>(
        "SELECT DISTINCT source FROM audit_log ORDER BY source",
      ),
    ]);

    // Label for the active household chip; the filter survives the household.
    let householdName: string | null = null;
    if (filters.household) {
      const hRes = await ctx.state.db.query<{ name: string }>(
        "SELECT name FROM households WHERE id = $1",
        [filters.household],
      );
      householdName = hRes.rows[0]?.name ?? "deleted household";
    }

    ctx.state.pageTitle = "Admin: Audit log";
    return {
      data: {
        entries: result.rows,
        currentPage,
        totalCount: Number(countRes.rows[0].cnt),
        filters,
        types: typesRes.rows.map((r) => r.target_type),
        sources: sourcesRes.rows.map((r) => r.source),
        householdName,
      },
    };
  },
});

/** Build a URL preserving all current filter state, with overrides applied. */
function filterUrl(
  current: AuditFilters,
  overrides: Partial<AuditFilters>,
): string {
  const merged = { ...current, ...overrides };
  const p = new URLSearchParams();
  for (const key of Object.keys(merged) as (keyof AuditFilters)[]) {
    if (merged[key]) p.set(key, merged[key]);
  }
  // Always reset to page 1 when filters change
  const s = p.toString();
  return `/admin/audit${s ? `?${s}` : ""}`;
}

function formatTime(d: Date): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const SOURCE_BADGE: Record<string, string> = {
  agent:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  system: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export default page(function AdminAuditPage(
  {
    data: {
      entries,
      currentPage,
      totalCount,
      filters,
      types,
      sources,
      householdName,
    },
    url,
  },
) {
  const hasFilters = Object.values(filters).some((v) => v !== "");
  const f = filters;
  return (
    <div>
      <PageHeader
        title="Audit log"
        query={f.q}
        searchPlaceholder="Search actions, targets, actors, details..."
        searchPreserve={{
          type: f.type,
          source: f.source,
          action: f.action,
          actor: f.actor,
          household: f.household,
          from: f.from,
          to: f.to,
        }}
      />
      <AdminNav currentPath={url.pathname} />

      <p class="text-sm text-stone-500 mb-3">
        Every edit operation across the platform, newest first: who changed
        what, in which household, and through which surface. Entries outlive the
        accounts and records they mention. Click an action, actor, or household
        in a row to filter by it.
      </p>

      <div class="card mb-4 space-y-3">
        <div class="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
              Type
            </div>
            <div class="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <FilterChip
                  key={t}
                  label={t}
                  active={f.type === t}
                  href={filterUrl(f, { type: f.type === t ? "" : t })}
                />
              ))}
            </div>
          </div>
          <div>
            <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
              Source
            </div>
            <div class="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <FilterChip
                  key={s}
                  label={s}
                  active={f.source === s}
                  href={filterUrl(f, { source: f.source === s ? "" : s })}
                />
              ))}
            </div>
          </div>
          <form method="GET" class="flex items-end gap-2">
            {Object.entries({
              q: f.q,
              type: f.type,
              source: f.source,
              action: f.action,
              actor: f.actor,
              household: f.household,
            }).filter(([, v]) => v).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <div>
              <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                From
              </div>
              <Input type="date" name="from" value={f.from} size="sm" />
            </div>
            <div>
              <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                To
              </div>
              <Input type="date" name="to" value={f.to} size="sm" />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
          </form>
        </div>
        {hasFilters && (
          <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-200 dark:border-stone-700">
            {f.action && (
              <FilterChip
                label={`action: ${f.action} ×`}
                capitalize={false}
                active
                href={filterUrl(f, { action: "" })}
              />
            )}
            {f.actor && (
              <FilterChip
                label={`by ${f.actor} ×`}
                capitalize={false}
                active
                href={filterUrl(f, { actor: "" })}
              />
            )}
            {f.household && (
              <FilterChip
                label={`in ${householdName ?? "household"} ×`}
                capitalize={false}
                active
                href={filterUrl(f, { household: "" })}
              />
            )}
            <span class="text-xs text-stone-400">
              {totalCount} {totalCount === 1 ? "entry" : "entries"}
            </span>
            {hasFilters && (
              <a href="/admin/audit" class="link text-xs ml-auto">
                Clear all filters
              </a>
            )}
          </div>
        )}
      </div>

      {entries.length === 0
        ? hasFilters
          ? (
            <EmptyState title="No entries match these filters">
              Try a shorter search, a wider date range, or{" "}
              <a href="/admin/audit" class="link">clear all filters</a>.
            </EmptyState>
          )
          : (
            <EmptyState title="No edit operations recorded yet">
              Creating, editing, or deleting recipes, ingredients, stores,
              tools, collections, and households lands here as it happens, as do
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
                    <a
                      href={filterUrl(f, {
                        action: f.action === e.action ? "" : e.action,
                      })}
                      title="Filter by this action"
                      class={`text-xs px-1.5 py-0.5 font-mono ${
                        f.action === e.action
                          ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
                          : "bg-stone-200 dark:bg-stone-700"
                      }`}
                    >
                      {e.action}
                    </a>
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
                    by{" "}
                    <a
                      href={filterUrl(f, {
                        actor: f.actor === e.actor_label ? "" : e.actor_label,
                      })}
                      title="Filter by this actor"
                      class="hover:underline"
                    >
                      {e.actor_label}
                    </a>
                    {e.household && (
                      <>
                        {" in "}
                        <a
                          href={filterUrl(f, {
                            household: f.household === e.household_id
                              ? ""
                              : e.household_id ?? "",
                          })}
                          title="Filter by this household"
                          class="hover:underline"
                        >
                          {e.household}
                        </a>
                      </>
                    )}
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
