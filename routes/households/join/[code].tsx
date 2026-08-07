import { handler, page } from "./$[code].ts";
import type { HouseholdInvite, HouseholdMember } from "../../../db/types.ts";
import { Button, ButtonLink } from "../../../components/Button.tsx";
import { FormField } from "../../../components/FormField.tsx";
import { Input } from "../../../components/Input.tsx";
import { logAudit } from "../../../lib/audit.ts";
import { loginUrl } from "../../../lib/auth.ts";

/**
 * An invitee usually has no account yet, so the link lands on sign-in first.
 * Carry the invite along so they come back here afterwards instead of being
 * dropped on the generic onboarding page with nothing but a "paste your invite
 * code" box; the code is in the URL they already clicked.
 */
function loginUrlForInvite(code: string): string {
  return loginUrl(`/households/join/${encodeURIComponent(code)}`);
}

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrlForInvite(ctx.params.code) },
      });
    }

    const code = ctx.params.code;

    const inviteRes = await ctx.state.db.query<HouseholdInvite>(
      `SELECT hi.*, h.name as household_name
       FROM household_invites hi
       JOIN households h ON h.id = hi.household_id
       WHERE hi.code = $1 AND hi.expires_at > now()`,
      [code],
    );

    if (inviteRes.rows.length === 0) {
      return { data: { error: "This invite link is invalid or has expired." } };
    }

    const invite = inviteRes.rows[0];

    // Check if already a member of this household
    const existingRes = await ctx.state.db.query(
      "SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2",
      [invite.household_id, ctx.state.user.id],
    );

    if (existingRes.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/household` },
      });
    }

    // Check if user already belongs to another household
    const membershipRes = await ctx.state.db.query<
      Pick<HouseholdMember, "household_id">
    >(
      "SELECT household_id FROM household_members WHERE user_id = $1",
      [ctx.state.user.id],
    );

    if (membershipRes.rows.length > 0) {
      return {
        data: {
          error:
            "You already belong to a household. Leave your current household before joining a new one.",
        },
      };
    }

    return { data: { invite } };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrlForInvite(ctx.params.code) },
      });
    }

    const code = ctx.params.code;

    const inviteRes = await ctx.state.db.query<HouseholdInvite>(
      `SELECT hi.*, h.name as household_name
       FROM household_invites hi
       JOIN households h ON h.id = hi.household_id
       WHERE hi.code = $1 AND hi.expires_at > now()`,
      [code],
    );

    if (inviteRes.rows.length === 0) {
      return { data: { error: "This invite link is invalid or has expired." } };
    }

    const invite = inviteRes.rows[0];

    // Check if already a member of this household
    const existingRes = await ctx.state.db.query(
      "SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2",
      [invite.household_id, ctx.state.user.id],
    );

    if (existingRes.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/household` },
      });
    }

    // Check if user already belongs to another household
    const membershipRes = await ctx.state.db.query<
      Pick<HouseholdMember, "household_id">
    >(
      "SELECT household_id FROM household_members WHERE user_id = $1",
      [ctx.state.user.id],
    );

    if (membershipRes.rows.length > 0) {
      return {
        data: {
          error:
            "You already belong to a household. Leave your current household before joining a new one.",
        },
      };
    }

    // An admin invite seeds an empty household: the joiner owns and names it.
    const form = await ctx.req.formData();
    const pickedName = String(form.get("name") ?? "").trim();
    let householdName = invite.household_name ?? invite.household_id;

    await ctx.state.db.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3)",
      [
        invite.household_id,
        ctx.state.user.id,
        invite.grants_owner ? "owner" : "member",
      ],
    );
    if (invite.grants_owner && pickedName) {
      await ctx.state.db.query(
        "UPDATE households SET name = $1, updated_at = now() WHERE id = $2",
        [pickedName, invite.household_id],
      );
      householdName = pickedName;
    }

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "household.join",
      targetType: "household",
      targetId: invite.household_id,
      targetLabel: householdName,
      detail: invite.grants_owner ? "as owner, via admin invite" : undefined,
      householdId: invite.household_id,
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/household` },
    });
  },
});

export default page(function JoinHouseholdPage(
  { data },
) {
  const { invite, error } = data as {
    invite?: HouseholdInvite;
    error?: string;
  };

  if (error) {
    return (
      <div class="max-w-md mx-auto mt-12 text-center">
        <h1 class="text-2xl font-bold mb-4">Invalid Invite</h1>
        <p class="text-stone-500 mb-6">{error}</p>
        <ButtonLink href="/households">
          Go to Households
        </ButtonLink>
      </div>
    );
  }

  if (invite!.grants_owner) {
    return (
      <div class="max-w-md mx-auto mt-12 text-center">
        <h1 class="text-2xl font-bold mb-2">Welcome to Foodex</h1>
        <p class="text-stone-500 mb-6">
          You've been invited to set up your own household. Give it a name to
          get started; you can always rename it later.
        </p>
        <form method="POST" class="card space-y-3 text-left">
          <FormField label="Household name">
            <Input
              type="text"
              name="name"
              required
              placeholder="e.g. Smith Family"
              class="w-full"
            />
          </FormField>
          <Button type="submit">
            Create my household
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div class="max-w-md mx-auto mt-12 text-center">
      <h1 class="text-2xl font-bold mb-2">Join Household</h1>
      <p class="text-stone-500 mb-6">
        You've been invited to join{" "}
        <span class="font-semibold text-stone-700 dark:text-stone-300">
          {invite!.household_name}
        </span>
      </p>
      <form method="POST">
        <Button type="submit">
          Join Household
        </Button>
      </form>
    </div>
  );
});
