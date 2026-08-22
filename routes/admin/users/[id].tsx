import { handler, page } from "./$[id].ts";
import { HttpError } from "fresh/errors";
import { AdminNav } from "../../../components/AdminNav.tsx";
import { PageHeader } from "../../../components/PageHeader.tsx";
import { SectionHeader } from "../../../components/SectionHeader.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { logAudit } from "../../../lib/audit.ts";
import { createT } from "../../../components/Translation.tsx";
import { pickBundle } from "../../../lib/i18n/locale.ts";
import { t as shared } from "../../../locales/shared.ts";
import en from "./[id].en.mfr";
import it from "./[id].it.mfr";

const t = createT({ en, it });

interface UserDetail {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  unit_system: string;
  timezone: string;
  language: string;
  created_at: Date;
  github_id: string | null;
  google_id: string | null;
  authentik_id: string | null;
}

export const handlers = handler({
  async GET(ctx) {
    const id = ctx.params.id;
    const q = ctx.state.db.query;

    const userRes = await q<UserDetail>(
      `SELECT id, name, email, avatar_url, unit_system, timezone, language, created_at,
              github_id, google_id, authentik_id
       FROM users WHERE id = $1`,
      [id],
    );
    if (userRes.rows.length === 0) throw new HttpError(404);
    const user = userRes.rows[0];

    const [membership, sessions, stats] = await Promise
      .all([
        q<{ household_id: string; household: string; role: string }>(
          `SELECT h.id AS household_id, h.name AS household, hm.role
           FROM household_members hm JOIN households h ON h.id = hm.household_id
           WHERE hm.user_id = $1`,
          [id],
        ),
        q<{ id: string; created_at: Date; expires_at: Date }>(
          `SELECT id, created_at, expires_at FROM sessions
           WHERE user_id = $1 AND expires_at > now()
           ORDER BY created_at DESC`,
          [id],
        ),
        q<{ favorites: string; agent_sessions: string; ai_tokens: string }>(
          `SELECT
             (SELECT COUNT(*) FROM recipe_favorites WHERE user_id = $1)
               AS favorites,
             (SELECT COUNT(*) FROM agent_sessions WHERE user_id = $1)
               AS agent_sessions,
             (SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
               FROM ocr_usage WHERE user_id = $1) AS ai_tokens`,
          [id],
        ),
      ]);

    const msg = pickBundle(ctx.state.locale, { en, it });
    ctx.state.pageTitle = msg.get("admin.namedTitle").format({
      name: user.name ?? user.email ?? msg.get("admin.noNameUser").format(),
    });
    return {
      data: {
        user,
        membership: membership.rows[0] ?? null,
        sessions: sessions.rows,
        stats: {
          favorites: Number(stats.rows[0].favorites),
          agentSessions: Number(stats.rows[0].agent_sessions),
          aiTokens: Number(stats.rows[0].ai_tokens),
        },
        isSelf: user.id === ctx.state.adminUser.id,
        error: ctx.url.searchParams.get("error") || undefined,
      },
    };
  },
  async POST(ctx) {
    const id = ctx.params.id;
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));

    const targetRes = await ctx.state.db.query<{
      name: string | null;
      email: string | null;
    }>("SELECT name, email FROM users WHERE id = $1", [id]);
    if (targetRes.rows.length === 0) throw new HttpError(404);
    const target = targetRes.rows[0];
    const targetLabel = `${target.name ?? "(no name)"} <${
      target.email ?? "no email"
    }>`;

    if (method === "REVOKE_SESSIONS") {
      const deleted = await ctx.state.db.query<{ id: string }>(
        "DELETE FROM sessions WHERE user_id = $1 RETURNING id",
        [id],
      );
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "user.revoke_sessions",
        targetType: "user",
        targetId: id,
        targetLabel,
        detail: `${deleted.rows.length} session${
          deleted.rows.length === 1 ? "" : "s"
        } revoked`,
      });
    } else if (method === "DELETE") {
      if (id === ctx.state.adminUser.id) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/admin/users/${id}?error=` +
              encodeURIComponent("You can't delete your own account here."),
          },
        });
      }
      await ctx.state.db.query("DELETE FROM users WHERE id = $1", [id]);
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "user.delete",
        targetType: "user",
        targetId: id,
        targetLabel,
      });
      return new Response(null, {
        status: 303,
        headers: { Location: "/admin/users" },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/users/${id}` },
    });
  },
});

function formatDate(d: Date): string {
  return new Date(d).toISOString().replace("T", " ").slice(0, 16);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div class="text-xs text-stone-400">{label}</div>
      <div class="text-sm break-all">{value}</div>
    </div>
  );
}

export default page(function AdminUserDetailPage(
  {
    data: {
      user,
      membership,
      sessions,
      stats,
      isSelf,
      error,
    },
    url,
  },
) {
  const trans = t.use();
  const sharedTrans = shared.use();
  return (
    <div>
      <PageHeader title={user.name ?? sharedTrans("common.noName")} noSearch />
      <AdminNav currentPath={url.pathname} />
      <BackLink href="/admin/users" label={trans("admin.allUsers")} />

      {error && <div class="alert-error my-4">{error}</div>}

      <div class="grid gap-6 md:grid-cols-2 mt-4">
        <div class="space-y-6">
          <div class="card">
            <SectionHeader title={trans("admin.account")} />
            <div class="flex items-center gap-3 mt-3 mb-4">
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt=""
                  class="size-12 rounded-full"
                />
              )}
              <div>
                <div class="font-medium">
                  {user.name ?? shared("common.noName")}
                </div>
                <div class="text-sm text-stone-500">
                  {user.email ?? shared("common.noEmail")}
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <Field label={trans("admin.userId")} value={user.id} />
              <Field
                label={trans("admin.created")}
                value={formatDate(user.created_at)}
              />
              <Field
                label={trans("admin.unitSystem")}
                value={user.unit_system}
              />
              <Field label={trans("admin.timezone")} value={user.timezone} />
              <Field label={trans("admin.language")} value={user.language} />
              <Field
                label={trans("admin.providers")}
                value={[
                  user.authentik_id && "Authentik",
                  user.github_id && "GitHub",
                  user.google_id && "Google",
                ].filter(Boolean).join(", ") || trans("admin.emailOnly")}
              />
              <Field
                label={sharedTrans("profile.household")}
                value={membership
                  ? `${membership.household} (${membership.role})`
                  : trans("admin.none")}
              />
            </div>
          </div>

          <div class="card">
            <SectionHeader title={trans("admin.activity")} />
            <div class="grid grid-cols-3 gap-3 mt-3 text-center">
              <div>
                <div class="text-xl font-bold">{stats.favorites}</div>
                <div class="text-xs text-stone-500">{t("admin.favorites")}</div>
              </div>
              <div>
                <div class="text-xl font-bold">{stats.agentSessions}</div>
                <div class="text-xs text-stone-500">
                  {t("admin.agentSessions")}
                </div>
              </div>
              <div>
                <div class="text-xl font-bold">
                  {stats.aiTokens.toLocaleString("en-US")}
                </div>
                <div class="text-xs text-stone-500">{t("admin.aiTokens")}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="card">
            <SectionHeader title={`Active sessions (${sessions.length})`} />
            {sessions.length === 0
              ? (
                <p class="text-sm text-stone-500 mt-3">
                  No active sessions.
                </p>
              )
              : (
                <div class="mt-3 space-y-1">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      class="flex justify-between text-sm text-stone-500"
                    >
                      <span>started {formatDate(s.created_at)}</span>
                      <span>expires {formatDate(s.expires_at)}</span>
                    </div>
                  ))}
                  <form method="POST" class="pt-3">
                    <input
                      type="hidden"
                      name="_method"
                      value="REVOKE_SESSIONS"
                    />
                    <ConfirmButton
                      message="Sign this user out everywhere?"
                      variant="danger-outline"
                      size="sm"
                    >
                      Revoke all sessions
                    </ConfirmButton>
                  </form>
                </div>
              )}
          </div>

          {!isSelf && (
            <div class="card">
              <SectionHeader title="Support access" />
              <p class="text-sm text-stone-500 my-3">
                Sudo lets you use the whole app as{" "}
                {user.name ?? "this user"}, including their household and
                private data, until you exit. Every change is recorded in the
                audit log under your name.
              </p>
              <form method="POST" action="/admin/sudo">
                <input type="hidden" name="_method" value="ENTER" />
                <input type="hidden" name="user_id" value={user.id} />
                <ConfirmButton
                  message={`Act as ${
                    user.name ?? "this user"
                  } across the app? A banner will show until you exit.`}
                  variant="outline"
                >
                  Sudo as {user.name ?? "user"}
                </ConfirmButton>
              </form>
            </div>
          )}

          <div class="card border-red-300 dark:border-red-900">
            <SectionHeader title={trans("admin.dangerZone")} />
            <p class="text-sm text-stone-500 mt-3">
              Deleting removes the account with its sessions, favorites, and
              assistant chats. Households and their recipes stay, even ones this
              user created.
            </p>
            {isSelf
              ? (
                <p class="text-sm text-stone-500 mt-3">
                  This is your own account; it can't be deleted from here.
                </p>
              )
              : (
                <form method="POST" class="mt-3">
                  <input type="hidden" name="_method" value="DELETE" />
                  <ConfirmButton
                    message="Permanently delete this user? Their sessions, favorites, and assistant chats go with them; households stay."
                    variant="danger"
                  >
                    Delete user
                  </ConfirmButton>
                </form>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});
