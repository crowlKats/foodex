import { handler, page } from "./$index.ts";
import { escapeLike } from "../../../utils.ts";
import { AdminNav } from "../../../components/AdminNav.tsx";
import { PageHeader } from "../../../components/PageHeader.tsx";
import { EmptyState } from "../../../components/EmptyState.tsx";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../../components/Pagination.tsx";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: Date;
  has_github: boolean;
  has_google: boolean;
  has_authentik: boolean;
  household: string | null;
  session_count: string;
}

const LIST_SQL = `
  SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
         u.github_id IS NOT NULL AS has_github,
         u.google_id IS NOT NULL AS has_google,
         u.authentik_id IS NOT NULL AS has_authentik,
         h.name AS household,
         (SELECT COUNT(*) FROM sessions s
           WHERE s.user_id = u.id AND s.expires_at > now()) AS session_count
  FROM users u
  LEFT JOIN household_members hm ON hm.user_id = u.id
  LEFT JOIN households h ON h.id = hm.household_id`;

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    let result, countRes;
    if (q) {
      const escaped = escapeLike(q);
      const where =
        `WHERE u.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR u.email ILIKE '%' || $1 || '%' ESCAPE '\\'`;
      [result, countRes] = await Promise.all([
        ctx.state.db.query<UserRow>(
          `${LIST_SQL} ${where} ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
          [escaped, limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM users u ${where}`,
          [escaped],
        ),
      ]);
    } else {
      [result, countRes] = await Promise.all([
        ctx.state.db.query<UserRow>(
          `${LIST_SQL} ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM users",
        ),
      ]);
    }

    ctx.state.pageTitle = "Admin: Users";
    return {
      data: {
        users: result.rows,
        q,
        currentPage,
        totalCount: Number(countRes.rows[0].cnt),
      },
    };
  },
});

function ProviderBadge({ label }: { label: string }) {
  return (
    <span class="text-xs bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5">
      {label}
    </span>
  );
}

export default page(function AdminUsersPage(
  { data: { users, q, currentPage, totalCount }, url },
) {
  return (
    <div>
      <PageHeader title="Users" query={q} searchPlaceholder="Search users..." />
      <AdminNav currentPath={url.pathname} />

      <div class="text-sm text-stone-500 mb-3">{totalCount} total</div>
      {users.length === 0
        ? (
          <EmptyState title={q ? `No users match "${q}"` : "No users yet"}>
            Accounts appear here as soon as someone signs in for the first time.
          </EmptyState>
        )
        : (
          <div class="space-y-2">
            {users.map((u) => (
              <a
                key={u.id}
                href={`/admin/users/${u.id}`}
                class="block card card-hover"
              >
                <div class="flex items-center gap-3">
                  {u.avatar_url && (
                    <img
                      src={u.avatar_url}
                      alt=""
                      class="size-8 rounded-full"
                    />
                  )}
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium">{u.name ?? "(no name)"}</span>
                      {u.has_authentik && <ProviderBadge label="authentik" />}
                      {u.has_github && <ProviderBadge label="github" />}
                      {u.has_google && <ProviderBadge label="google" />}
                      {!u.has_authentik && !u.has_github && !u.has_google && (
                        <ProviderBadge label="email" />
                      )}
                    </div>
                    <div class="text-sm text-stone-500 truncate">
                      {u.email ?? "no email"}
                      {u.household ? ` · ${u.household}` : " · no household"}
                    </div>
                  </div>
                  <div class="text-right text-xs text-stone-400 shrink-0">
                    <div>
                      joined {new Date(u.created_at).toISOString().slice(0, 10)}
                    </div>
                    <div>
                      {Number(u.session_count)}{" "}
                      session{Number(u.session_count) === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      <Pagination currentPage={currentPage} totalCount={totalCount} url={url} />
    </div>
  );
});
