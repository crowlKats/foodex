import { handler, page } from "./$[id].ts";
import { HttpError } from "fresh/errors";
import { AdminNav } from "../../../components/AdminNav.tsx";
import { PageHeader } from "../../../components/PageHeader.tsx";
import { SectionHeader } from "../../../components/SectionHeader.tsx";
import { BackLink } from "../../../components/BackLink.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { logAudit } from "../../../lib/audit.ts";

export const handlers = handler({
  async GET(ctx) {
    const id = ctx.params.id;
    const q = ctx.state.db.query;

    const hhRes = await q<{
      id: string;
      name: string;
      created_at: Date;
      created_by: string | null;
      created_by_name: string | null;
    }>(
      `SELECT h.id, h.name, h.created_at, h.created_by, u.name AS created_by_name
       FROM households h LEFT JOIN users u ON u.id = h.created_by
       WHERE h.id = $1`,
      [id],
    );
    if (hhRes.rows.length === 0) throw new HttpError(404);
    const household = hhRes.rows[0];

    const [members, counts, recentRecipes] = await Promise.all([
      q<{
        user_id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
        role: string;
      }>(
        `SELECT u.id AS user_id, u.name, u.email, u.avatar_url, hm.role
         FROM household_members hm JOIN users u ON u.id = hm.user_id
         WHERE hm.household_id = $1
         ORDER BY hm.role DESC, u.name`,
        [id],
      ),
      q<{
        recipes: string;
        private_recipes: string;
        pantry: string;
        media_count: string;
        media_bytes: string;
        collections: string;
        plan_entries: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM recipes WHERE household_id = $1) AS recipes,
           (SELECT COUNT(*) FROM recipes
             WHERE household_id = $1 AND private) AS private_recipes,
           (SELECT COUNT(*) FROM pantry_items
             WHERE household_id = $1) AS pantry,
           (SELECT COUNT(*) FROM media WHERE household_id = $1) AS media_count,
           (SELECT COALESCE(SUM(size_bytes), 0) FROM media
             WHERE household_id = $1) AS media_bytes,
           (SELECT COUNT(*) FROM collections
             WHERE household_id = $1) AS collections,
           (SELECT COUNT(*) FROM plan_entries
             WHERE household_id = $1) AS plan_entries`,
        [id],
      ),
      q<{ slug: string; title: string; private: boolean; created_at: Date }>(
        `SELECT slug, title, private, created_at FROM recipes
         WHERE household_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [id],
      ),
    ]);

    ctx.state.pageTitle = `Admin: ${household.name}`;
    return {
      data: {
        household,
        members: members.rows,
        counts: counts.rows[0],
        recentRecipes: recentRecipes.rows,
        error: ctx.url.searchParams.get("error") || undefined,
      },
    };
  },
  async POST(ctx) {
    const id = ctx.params.id;
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));

    const targetRes = await ctx.state.db.query<{ name: string }>(
      "SELECT name FROM households WHERE id = $1",
      [id],
    );
    if (targetRes.rows.length === 0) throw new HttpError(404);
    const targetLabel = targetRes.rows[0].name;

    if (method === "REMOVE_MEMBER") {
      const userId = String(form.get("user_id"));
      const memberRes = await ctx.state.db.query<{
        name: string | null;
        email: string | null;
      }>("SELECT name, email FROM users WHERE id = $1", [userId]);
      const member = memberRes.rows[0];
      await ctx.state.db.query(
        "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
        [id, userId],
      );
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "household.remove_member",
        targetType: "household",
        targetId: id,
        targetLabel,
        detail: member
          ? `removed ${member.name ?? "(no name)"} <${
            member.email ?? "no email"
          }>`
          : `removed unknown user ${userId}`,
      });
    } else if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM households WHERE id = $1", [id]);
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "household.delete",
        targetType: "household",
        targetId: id,
        targetLabel,
      });
      return new Response(null, {
        status: 303,
        headers: { Location: "/admin/households" },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/households/${id}` },
    });
  },
});

export default page(function AdminHouseholdDetailPage(
  { data: { household, members, counts, recentRecipes, error }, url },
) {
  return (
    <div>
      <PageHeader title={household.name} noSearch />
      <AdminNav currentPath={url.pathname} />
      <BackLink href="/admin/households" label="All households" />

      {error && <div class="alert-error my-4">{error}</div>}

      <div class="grid gap-6 md:grid-cols-2 mt-4">
        <div class="space-y-6">
          <div class="card">
            <SectionHeader title={`Members (${members.length})`} />
            <div class="mt-3 space-y-2">
              {members.map((m) => (
                <div key={m.user_id} class="flex items-center gap-3">
                  {m.avatar_url && (
                    <img
                      src={m.avatar_url}
                      alt=""
                      class="size-8 rounded-full"
                    />
                  )}
                  <div class="flex-1 min-w-0">
                    <a
                      href={`/admin/users/${m.user_id}`}
                      class="font-medium link"
                    >
                      {m.name ?? "(no name)"}
                    </a>
                    <span class="text-xs text-stone-400 ml-2">{m.role}</span>
                    <div class="text-sm text-stone-500 truncate">
                      {m.email ?? "no email"}
                    </div>
                  </div>
                  <form method="POST">
                    <input type="hidden" name="_method" value="REMOVE_MEMBER" />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <ConfirmButton
                      message={`Remove ${
                        m.name ?? "this member"
                      } from the household? Their account stays; they lose access to its recipes and pantry.`}
                      variant="danger-outline"
                      size="xs"
                    >
                      Remove
                    </ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          </div>

          <div class="card">
            <SectionHeader title="Contents" />
            <div class="grid grid-cols-3 gap-3 mt-3 text-center">
              <div>
                <div class="text-xl font-bold">{Number(counts.recipes)}</div>
                <div class="text-xs text-stone-500">
                  recipes ({Number(counts.private_recipes)} private)
                </div>
              </div>
              <div>
                <div class="text-xl font-bold">{Number(counts.pantry)}</div>
                <div class="text-xs text-stone-500">pantry items</div>
              </div>
              <div>
                <div class="text-xl font-bold">
                  {Number(counts.collections)}
                </div>
                <div class="text-xs text-stone-500">collections</div>
              </div>
              <div>
                <div class="text-xl font-bold">
                  {Number(counts.media_count)}
                </div>
                <div class="text-xs text-stone-500">media files</div>
              </div>
              <div>
                <div class="text-xl font-bold">
                  {Number(counts.plan_entries)}
                </div>
                <div class="text-xs text-stone-500">plan entries</div>
              </div>
            </div>
            <p class="text-xs text-stone-400 mt-3">
              Created{" "}
              {new Date(household.created_at).toISOString().slice(0, 10)}
              {household.created_by_name
                ? ` by ${household.created_by_name}`
                : ""}.
            </p>
          </div>

          <div class="card border-red-300 dark:border-red-900">
            <SectionHeader title="Danger zone" />
            <p class="text-sm text-stone-500 my-3">
              Deleting a household removes its recipes, pantry, shopping lists,
              collections, and media references. Member accounts stay and can
              create or join another household.
            </p>
            <form method="POST">
              <input type="hidden" name="_method" value="DELETE" />
              <ConfirmButton
                message={`Permanently delete "${household.name}" and everything in it?`}
                variant="danger"
              >
                Delete household
              </ConfirmButton>
            </form>
          </div>
        </div>

        <div>
          <div class="card">
            <SectionHeader title="Recent recipes" />
            {recentRecipes.length === 0
              ? <p class="text-sm text-stone-500 mt-3">No recipes.</p>
              : (
                <div class="mt-3 space-y-1">
                  {recentRecipes.map((r) => (
                    <div key={r.slug} class="flex items-center gap-2 text-sm">
                      <a
                        href={`/recipes/${r.slug}`}
                        class="link flex-1 truncate"
                      >
                        {r.title}
                      </a>
                      {r.private && (
                        <span class="text-xs bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5">
                          private
                        </span>
                      )}
                      <span class="text-xs text-stone-400">
                        {new Date(r.created_at).toISOString().slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});
