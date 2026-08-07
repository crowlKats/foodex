import { handler, page } from "./$index.ts";
import { escapeLike } from "../../../utils.ts";
import { AdminNav } from "../../../components/AdminNav.tsx";
import { PageHeader } from "../../../components/PageHeader.tsx";
import { EmptyState } from "../../../components/EmptyState.tsx";
import { SectionHeader } from "../../../components/SectionHeader.tsx";
import { FormField } from "../../../components/FormField.tsx";
import { Input } from "../../../components/Input.tsx";
import { Button } from "../../../components/Button.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { generateInviteCode } from "../../../lib/auth.ts";
import { sendHouseholdInviteEmail } from "../../../lib/email.ts";
import { logAudit } from "../../../lib/audit.ts";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../../components/Pagination.tsx";

interface HouseholdRow {
  id: string;
  name: string;
  created_at: Date;
  created_by_name: string | null;
  member_count: string;
  recipe_count: string;
  pantry_count: string;
}

interface PendingInvite {
  id: string;
  code: string;
  invited_email: string | null;
  created_at: Date;
  expires_at: Date;
}

const LIST_SQL = `
  SELECT h.id, h.name, h.created_at, u.name AS created_by_name,
         (SELECT COUNT(*) FROM household_members m
           WHERE m.household_id = h.id) AS member_count,
         (SELECT COUNT(*) FROM recipes r
           WHERE r.household_id = h.id) AS recipe_count,
         (SELECT COUNT(*) FROM pantry_items p
           WHERE p.household_id = h.id) AS pantry_count
  FROM households h
  LEFT JOIN users u ON u.id = h.created_by`;

function redirectWith(param: string, value: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin/households?${param}=${encodeURIComponent(value)}`,
    },
  });
}

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    let result, countRes;
    if (q) {
      const escaped = escapeLike(q);
      [result, countRes] = await Promise.all([
        ctx.state.db.query<HouseholdRow>(
          `${LIST_SQL} WHERE h.name ILIKE '%' || $1 || '%' ESCAPE '\\'
           ORDER BY h.created_at DESC LIMIT $2 OFFSET $3`,
          [escaped, limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM households h
           WHERE h.name ILIKE '%' || $1 || '%' ESCAPE '\\'`,
          [escaped],
        ),
      ]);
    } else {
      [result, countRes] = await Promise.all([
        ctx.state.db.query<HouseholdRow>(
          `${LIST_SQL} ORDER BY h.created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM households",
        ),
      ]);
    }

    // Admin invites whose household is still empty: not yet accepted.
    const invites = await ctx.state.db.query<PendingInvite>(
      `SELECT hi.id, hi.code, hi.invited_email, hi.created_at, hi.expires_at
       FROM household_invites hi
       WHERE hi.grants_owner AND NOT EXISTS (
         SELECT 1 FROM household_members m
         WHERE m.household_id = hi.household_id
       )
       ORDER BY hi.created_at DESC`,
    );

    ctx.state.pageTitle = "Admin: Households";
    return {
      data: {
        households: result.rows,
        invites: invites.rows,
        q,
        currentPage,
        totalCount: Number(countRes.rows[0].cnt),
        msg: ctx.url.searchParams.get("msg") || undefined,
        error: ctx.url.searchParams.get("error") || undefined,
      },
    };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));

    if (method === "INVITE") {
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return redirectWith("error", "A valid email address is required.");
      }

      const dupe = await ctx.state.db.query(
        `SELECT 1 FROM household_invites hi
         WHERE hi.grants_owner AND hi.invited_email = $1
           AND hi.expires_at > now()
           AND NOT EXISTS (
             SELECT 1 FROM household_members m
             WHERE m.household_id = hi.household_id
           )`,
        [email],
      );
      if (dupe.rows.length > 0) {
        return redirectWith("error", `${email} already has a pending invite.`);
      }

      const code = generateInviteCode();
      await ctx.state.db.transaction(async (q) => {
        // The household exists from the start so the regular join flow can be
        // reused; the invitee owns and names it on arrival.
        const hh = await q<{ id: string }>(
          "INSERT INTO households (name, created_by) VALUES ($1, $2) RETURNING id",
          ["New Household", ctx.state.adminUser.id],
        );
        await q(
          `INSERT INTO household_invites
             (household_id, code, created_by, invited_email, grants_owner)
           VALUES ($1, $2, $3, $4, true)`,
          [hh.rows[0].id, code, ctx.state.adminUser.id, email],
        );
      });

      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "user.invite",
        targetType: "user",
        targetLabel: email,
        detail: "invited with a new household",
      });

      const inviteUrl =
        `${ctx.url.protocol}//${ctx.url.host}/households/join/${code}`;
      try {
        await sendHouseholdInviteEmail(email, inviteUrl);
        return redirectWith("msg", `Invite emailed to ${email}.`);
      } catch (err) {
        console.error("Failed to send invite email:", err);
        return redirectWith(
          "msg",
          `Invite created for ${email}, but the email could not be sent. ` +
            "Share the link from the pending list instead.",
        );
      }
    } else if (method === "REVOKE_INVITE") {
      const inviteId = String(form.get("invite_id"));
      const inviteRes = await ctx.state.db.query<{
        household_id: string;
        invited_email: string | null;
        member_count: string;
      }>(
        `SELECT hi.household_id, hi.invited_email,
           (SELECT COUNT(*) FROM household_members m
             WHERE m.household_id = hi.household_id) AS member_count
         FROM household_invites hi
         WHERE hi.id = $1 AND hi.grants_owner`,
        [inviteId],
      );
      if (inviteRes.rows.length > 0) {
        const invite = inviteRes.rows[0];
        if (Number(invite.member_count) === 0) {
          // The empty household existed only for this invite; the delete
          // cascades to the invite row.
          await ctx.state.db.query(
            "DELETE FROM households WHERE id = $1",
            [invite.household_id],
          );
        } else {
          await ctx.state.db.query(
            "DELETE FROM household_invites WHERE id = $1",
            [inviteId],
          );
        }
        await logAudit(ctx.state.db.query, ctx.state.adminUser, {
          source: "admin",
          action: "user.revoke_invite",
          targetType: "user",
          targetLabel: invite.invited_email ?? "(no email)",
        });
      }
      return redirectWith("msg", "Invite revoked.");
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/households" },
    });
  },
});

export default page(function AdminHouseholdsPage(
  {
    data: { households, invites, q, currentPage, totalCount, msg, error },
    url,
  },
) {
  return (
    <div>
      <PageHeader
        title="Households"
        query={q}
        searchPlaceholder="Search households..."
      />
      <AdminNav currentPath={url.pathname} />

      {msg && <div class="alert-success mb-4">{msg}</div>}
      {error && <div class="alert-error mb-4">{error}</div>}

      <div class="grid gap-6 md:grid-cols-2 mb-8">
        <div class="card">
          <SectionHeader title="Invite a new user" />
          <p class="text-sm text-stone-500 my-3">
            Creates an empty household and emails an invite link. The invitee
            becomes its owner and picks the name when they join.
          </p>
          <form method="POST" class="flex gap-2 items-end">
            <input type="hidden" name="_method" value="INVITE" />
            <div class="flex-1">
              <FormField label="Email">
                <Input
                  type="email"
                  name="email"
                  required
                  placeholder="person@example.com"
                  class="w-full"
                />
              </FormField>
            </div>
            <Button type="submit">Invite</Button>
          </form>
        </div>

        <div class="card">
          <SectionHeader title={`Pending invites (${invites.length})`} />
          {invites.length === 0
            ? (
              <p class="text-sm text-stone-500 mt-3">
                No outstanding invites.
              </p>
            )
            : (
              <div class="mt-3 space-y-3">
                {invites.map((i) => {
                  const expired = new Date(i.expires_at) < new Date();
                  return (
                    <div key={i.id}>
                      <div class="flex items-center gap-2">
                        <span class="font-medium flex-1 truncate">
                          {i.invited_email ?? "(no email)"}
                        </span>
                        {expired && (
                          <span class="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-1.5 py-0.5">
                            expired
                          </span>
                        )}
                        <form method="POST">
                          <input
                            type="hidden"
                            name="_method"
                            value="REVOKE_INVITE"
                          />
                          <input type="hidden" name="invite_id" value={i.id} />
                          <ConfirmButton
                            message={`Revoke the invite for ${
                              i.invited_email ?? "this address"
                            }? Its empty household is removed too.`}
                            variant="danger-outline"
                            size="xs"
                          >
                            Revoke
                          </ConfirmButton>
                        </form>
                      </div>
                      <div class="text-xs text-stone-400 font-mono break-all select-all">
                        {`${url.protocol}//${url.host}/households/join/${i.code}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      <div class="text-sm text-stone-500 mb-3">{totalCount} total</div>
      {households.length === 0
        ? (
          <EmptyState
            title={q ? `No households match "${q}"` : "No households yet"}
          >
            A household is created during onboarding, so one appears here for
            every active account or group.
          </EmptyState>
        )
        : (
          <div class="space-y-2">
            {households.map((h) => (
              <a
                key={h.id}
                href={`/admin/households/${h.id}`}
                class="block card card-hover"
              >
                <div class="flex items-center gap-2">
                  <span class="font-medium flex-1">{h.name}</span>
                  <span class="text-xs text-stone-400">
                    created {new Date(h.created_at).toISOString().slice(0, 10)}
                    {h.created_by_name ? ` by ${h.created_by_name}` : ""}
                  </span>
                </div>
                <div class="text-sm text-stone-500">
                  {Number(h.member_count)}{" "}
                  member{Number(h.member_count) === 1 ? "" : "s"} ·{" "}
                  {Number(h.recipe_count)}{" "}
                  recipe{Number(h.recipe_count) === 1 ? "" : "s"} ·{" "}
                  {Number(h.pantry_count)}{" "}
                  pantry item{Number(h.pantry_count) === 1 ? "" : "s"}
                </div>
              </a>
            ))}
          </div>
        )}
      <Pagination currentPage={currentPage} totalCount={totalCount} url={url} />
    </div>
  );
});
