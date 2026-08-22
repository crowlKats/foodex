import { handler, page } from "./$settings.ts";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import ShareButton from "../../islands/ShareButton.tsx";
import { IconArrowLeft } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { logAudit } from "../../lib/audit.ts";
import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
} from "../../db/types.ts";
import { generateInviteCode } from "../../lib/auth.ts";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./settings.en.mfr";
import it from "./settings.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = ctx.state.householdId;

    const memberCheck = await ctx.state.db.query<Pick<HouseholdMember, "role">>(
      "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }
    const myRole = memberCheck.rows[0].role;

    const [householdRes, membersRes, invitesRes] = await Promise.all([
      ctx.state.db.query<Household>("SELECT * FROM households WHERE id = $1", [
        id,
      ]),
      ctx.state.db.query<HouseholdMember>(
        `SELECT hm.*, u.name, u.email, u.avatar_url
           FROM household_members hm
           JOIN users u ON u.id = hm.user_id
           WHERE hm.household_id = $1
           ORDER BY hm.role DESC, u.name`,
        [id],
      ),
      ctx.state.db.query<HouseholdInvite>(
        `SELECT * FROM household_invites
           WHERE household_id = $1 AND expires_at > now()
           ORDER BY created_at DESC`,
        [id],
      ),
    ]);

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "household.settingsTitle",
    ).format({
      name: householdRes.rows[0].name,
    });
    return {
      data: {
        household: householdRes.rows[0],
        members: membersRes.rows,
        invites: invitesRes.rows,
        myRole,
        error: ctx.url.searchParams.get("error") || undefined,
      },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = ctx.state.householdId;
    const form = await ctx.req.formData();
    const method = form.get("_method");

    const memberCheck = await ctx.state.db.query<
      Pick<HouseholdMember, "role"> & { household_name: string }
    >(
      `SELECT hm.role, h.name as household_name
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.household_id = $1 AND hm.user_id = $2`,
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }
    const myRole = memberCheck.rows[0].role;
    const householdName = memberCheck.rows[0].household_name;

    if (method === "CREATE_INVITE" && myRole === "owner") {
      const code = generateInviteCode();
      await ctx.state.db.query(
        "INSERT INTO household_invites (household_id, code, created_by) VALUES ($1, $2, $3)",
        [id, code, ctx.state.user.id],
      );
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.create_invite",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: id,
      });
    } else if (method === "REVOKE_INVITE" && myRole === "owner") {
      const inviteId = String(form.get("invite_id"));
      await ctx.state.db.query(
        "DELETE FROM household_invites WHERE id = $1 AND household_id = $2",
        [inviteId, id],
      );
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.revoke_invite",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: id,
      });
    } else if (method === "REMOVE_MEMBER" && myRole === "owner") {
      const memberId = String(form.get("member_user_id"));
      if (memberId !== ctx.state.user.id) {
        const memberRes = await ctx.state.db.query<{
          name: string | null;
          email: string | null;
        }>("SELECT name, email FROM users WHERE id = $1", [memberId]);
        const member = memberRes.rows[0];
        await ctx.state.db.query(
          "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
          [id, memberId],
        );
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "household.remove_member",
          targetType: "household",
          targetId: id,
          targetLabel: householdName,
          detail: member
            ? `removed ${member.name ?? "(no name)"} <${
              member.email ?? "no email"
            }>`
            : `removed unknown user ${memberId}`,
          householdId: id,
        });
      }
    } else if (method === "PROMOTE_MEMBER" && myRole === "owner") {
      const memberId = String(form.get("member_user_id"));
      const promoted = await ctx.state.db.query<{ user_id: string }>(
        `UPDATE household_members SET role = 'owner'
         WHERE household_id = $1 AND user_id = $2 AND role = 'member'
         RETURNING user_id`,
        [id, memberId],
      );
      if (promoted.rows.length > 0) {
        const memberRes = await ctx.state.db.query<{
          name: string | null;
          email: string | null;
        }>("SELECT name, email FROM users WHERE id = $1", [memberId]);
        const member = memberRes.rows[0];
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "household.promote_member",
          targetType: "household",
          targetId: id,
          targetLabel: householdName,
          detail: member
            ? `made ${member.name ?? "(no name)"} <${
              member.email ?? "no email"
            }> an owner`
            : undefined,
          householdId: id,
        });
      }
    } else if (method === "LEAVE") {
      // An owner may leave only once someone else owns the household, so it
      // is never left without anyone who can manage members and settings.
      let canLeave = myRole !== "owner";
      if (!canLeave) {
        const others = await ctx.state.db.query(
          `SELECT 1 FROM household_members
           WHERE household_id = $1 AND role = 'owner' AND user_id != $2`,
          [id, ctx.state.user.id],
        );
        canLeave = others.rows.length > 0;
      }
      if (!canLeave) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/household/settings?error=" + encodeURIComponent(
              pickBundle(ctx.state.locale, { en, it }).get(
                "household.leaveNeedOwner",
              ).format(),
            ),
          },
        });
      }
      await ctx.state.db.query(
        "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
        [id, ctx.state.user.id],
      );
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.leave",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: id,
      });
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    } else if (method === "UPDATE_NAME" && myRole === "owner") {
      const name = form.get("name") as string;
      if (name?.trim()) {
        await ctx.state.db.query(
          "UPDATE households SET name = $1, updated_at = now() WHERE id = $2",
          [name.trim(), id],
        );
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "household.rename",
          targetType: "household",
          targetId: id,
          targetLabel: name.trim(),
          detail: `renamed from ${householdName}`,
          householdId: id,
        });
      }
    } else if (method === "DELETE" && myRole === "owner") {
      await ctx.state.db.query("DELETE FROM households WHERE id = $1", [id]);
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.delete",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: null,
      });
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/household/settings" },
    });
  },
});

export default page(function HouseholdSettingsPage(
  {
    data: { household, members, invites, myRole, error },
    state,
    url,
  },
) {
  const trans = t.use();
  const sharedTrans = shared.use();
  const isOwner = myRole === "owner";
  const otherOwners = members.some((m) =>
    m.role === "owner" && m.user_id !== state.user!.id
  );

  return (
    <div class="max-w-2xl">
      <a href="/household" class="link text-sm">
        <IconArrowLeft class="size-3.5 inline mr-1" />
        {t("household.backToHousehold")}
      </a>
      <h1 class="text-2xl font-bold mt-4 mb-6">
        {t("household.settingsTitle", { name: household.name })}
      </h1>

      {error && <div class="alert-error mb-4">{error}</div>}

      <div class="space-y-6">
        <div class="card">
          <h2 class="text-lg font-semibold mb-3">
            {t("household.members", { count: members.length })}
          </h2>
          <div class="space-y-2">
            {members.map((m) => (
              <div
                key={m.user_id}
                class="flex items-center gap-3"
              >
                {m.avatar_url && (
                  <img
                    src={m.avatar_url}
                    alt={m.name}
                    class="size-8 rounded-full"
                  />
                )}
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">
                    {m.name}
                    {m.user_id === state.user!.id && (
                      <span class="text-xs text-stone-400 ml-1">
                        {shared("common.you")}
                      </span>
                    )}
                  </div>
                  {m.email && (
                    <div class="text-xs text-stone-500 truncate">
                      {m.email}
                    </div>
                  )}
                </div>
                <span
                  class={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    m.role === "owner"
                      ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
                      : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                  }`}
                >
                  {m.role === "owner"
                    ? t("household.owner")
                    : t("household.member")}
                </span>
                {isOwner && m.user_id !== state.user!.id &&
                  m.role === "member" && (
                  <form method="POST" class="inline shrink-0">
                    <input
                      type="hidden"
                      name="_method"
                      value="PROMOTE_MEMBER"
                    />
                    <input
                      type="hidden"
                      name="member_user_id"
                      value={m.user_id}
                    />
                    <ConfirmButton
                      message={trans("household.makeOwnerConfirm", {
                        name: m.name ?? "",
                      })}
                      variant="ghost"
                      size="xs"
                    >
                      {t("household.makeOwner")}
                    </ConfirmButton>
                  </form>
                )}
                {isOwner && m.user_id !== state.user!.id && (
                  <form method="POST" class="inline shrink-0">
                    <input
                      type="hidden"
                      name="_method"
                      value="REMOVE_MEMBER"
                    />
                    <input
                      type="hidden"
                      name="member_user_id"
                      value={m.user_id}
                    />
                    <Button
                      type="submit"
                      variant="danger-ghost"
                      icon={IconTrash}
                      title={trans("household.removeMember")}
                    />
                  </form>
                )}
              </div>
            ))}
          </div>
          {(!isOwner || otherOwners) && (
            <form method="POST" class="mt-4">
              <input type="hidden" name="_method" value="LEAVE" />
              <ConfirmButton
                message={trans("household.leaveConfirm")}
                variant="danger-outline"
                class="w-full"
              >
                {t("household.leave")}
              </ConfirmButton>
            </form>
          )}
          {isOwner && !otherOwners && members.length > 1 && (
            <p class="text-xs text-stone-400 mt-4">
              {t("household.movingOutHint")}
            </p>
          )}
          <p class="text-xs text-stone-400 mt-2">
            {t("household.leavingHint")}{" "}
            <a href="/moving-box" class="link">
              {t("household.packBox")}
            </a>{" "}
            {t("household.packBoxRest")}
          </p>
        </div>

        {isOwner && (
          <div class="card">
            <h2 class="text-lg font-semibold mb-3">
              {t("household.inviteLink")}
            </h2>
            <p class="text-xs text-stone-500 mb-3">
              {t("household.inviteHelp")}
            </p>

            {invites.length > 0 && (
              <div class="space-y-2 mb-3">
                {invites.map((inv) => {
                  const inviteUrl = `${url.origin}/households/join/${inv.code}`;
                  return (
                    <div
                      key={inv.id}
                      class="flex items-center gap-2 text-sm bg-stone-50 dark:bg-stone-800 p-2 border border-stone-200 dark:border-stone-700"
                    >
                      {
                        /*
                        min-w-0: a flex item's default min-width is its
                        content, so this read-only input refused to
                        shrink and pushed the Share button and the
                        revoke icon out past the row's border.
                      */
                      }
                      <Input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        class="flex-1 min-w-0 bg-transparent border-none p-0 h-auto"
                        size="xs"
                      />
                      <div class="shrink-0">
                        <ShareButton url={inviteUrl} />
                      </div>
                      <form method="POST" class="inline shrink-0">
                        <input
                          type="hidden"
                          name="_method"
                          value="REVOKE_INVITE"
                        />
                        <input
                          type="hidden"
                          name="invite_id"
                          value={inv.id}
                        />
                        <Button
                          type="submit"
                          variant="danger-ghost"
                          icon={IconTrash}
                          title={sharedTrans("household.revoke")}
                        />
                      </form>
                    </div>
                  );
                })}
              </div>
            )}

            <form method="POST">
              <input
                type="hidden"
                name="_method"
                value="CREATE_INVITE"
              />
              <Button type="submit" class="w-full">
                {t("household.generateInvite")}
              </Button>
            </form>
          </div>
        )}

        {isOwner && (
          <div class="card">
            <h2 class="text-lg font-semibold mb-3">
              {t("household.householdName")}
            </h2>
            <form method="POST" class="space-y-3">
              <input type="hidden" name="_method" value="UPDATE_NAME" />
              <FormField label={trans("household.householdName")}>
                <Input
                  type="text"
                  name="name"
                  value={household.name}
                  required
                  class="w-full"
                />
              </FormField>
              <Button type="submit">
                {shared("common.update")}
              </Button>
            </form>
          </div>
        )}

        {isOwner && (
          <div class="card">
            <h2 class="text-lg font-semibold mb-3 text-red-600">
              {t("household.dangerZone")}
            </h2>
            <form method="POST">
              <input type="hidden" name="_method" value="DELETE" />
              <ConfirmButton
                message={trans("household.deleteConfirm")}
                variant="danger"
                class="w-full"
              >
                {t("household.deleteHousehold")}
              </ConfirmButton>
            </form>
          </div>
        )}
      </div>
    </div>
  );
});
