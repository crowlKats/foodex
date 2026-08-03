import { handler, page } from "./$index.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import type { Household, HouseholdInvite } from "../../db/types.ts";
import { loginUrl, sanitizeRedirect } from "../../lib/auth.ts";

export const handlers = handler({
  async GET(ctx) {
    const redirectTo = sanitizeRedirect(ctx.url.searchParams.get("redirect"));

    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl(ctx.url.pathname + ctx.url.search) },
      });
    }

    // If user already belongs to a household, redirect to it
    const result = await ctx.state.db.query<Pick<Household, "id">>(
      `SELECT h.id FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1`,
      [ctx.state.user.id],
    );

    if (result.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: redirectTo ?? `/household` },
      });
    }

    ctx.state.pageTitle = "Join or Create Household";
    return { data: { redirectTo } };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl(ctx.url.pathname + ctx.url.search) },
      });
    }

    const form = await ctx.req.formData();
    const rawRedirect = form.get("redirect");
    // Onboarding is a detour: hand the user back to whatever sent them here.
    const redirectTo = sanitizeRedirect(
      typeof rawRedirect === "string" ? rawRedirect : null,
    );
    const done = redirectTo ?? "/household";

    // If user already belongs to a household, redirect to it
    const existing = await ctx.state.db.query<Pick<Household, "id">>(
      `SELECT h.id FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1`,
      [ctx.state.user.id],
    );
    if (existing.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: done },
      });
    }

    const method = form.get("_method");

    if (method === "JOIN") {
      const code = (form.get("code") as string)?.trim();
      if (!code) {
        return { data: { error: "Invite code is required", redirectTo } };
      }

      const inviteRes = await ctx.state.db.query<
        Pick<HouseholdInvite, "household_id">
      >(
        `SELECT hi.household_id FROM household_invites hi
         WHERE hi.code = $1 AND hi.expires_at > now()`,
        [code],
      );
      if (inviteRes.rows.length === 0) {
        return {
          data: { error: "Invalid or expired invite code", redirectTo },
        };
      }

      const householdId = inviteRes.rows[0].household_id;
      await ctx.state.db.query(
        "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')",
        [householdId, ctx.state.user.id],
      );

      return new Response(null, {
        status: 303,
        headers: { Location: done },
      });
    }

    const name = form.get("name") as string;

    if (!name?.trim()) {
      return { data: { error: "Name is required", redirectTo } };
    }

    const houseRes = await ctx.state.db.query<Pick<Household, "id">>(
      "INSERT INTO households (name, created_by) VALUES ($1, $2) RETURNING id",
      [name.trim(), ctx.state.user.id],
    );
    const householdId = houseRes.rows[0].id;

    await ctx.state.db.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')",
      [householdId, ctx.state.user.id],
    );

    return new Response(null, {
      status: 303,
      headers: { Location: done },
    });
  },
});

export default page(function HouseholdsPage({ data }) {
  const { error, redirectTo } = data as {
    error?: string;
    redirectTo?: string | null;
  };
  const carryRedirect = redirectTo
    ? <input type="hidden" name="redirect" value={redirectTo} />
    : null;

  return (
    <div class="max-w-md mx-auto mt-12">
      <PageHeader title="Get Started" noSearch />

      <p class="text-stone-500 mb-6">
        Create a new household or join an existing one to manage recipes, tools,
        stores, and your pantry.
      </p>

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      <div class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold mb-3">Create Household</h2>
          <form method="POST" class="card space-y-3">
            {carryRedirect}
            <FormField label="Name">
              <Input
                type="text"
                name="name"
                required
                placeholder="e.g. Smith Family"
                class="w-full"
              />
            </FormField>
            <Button type="submit">
              Create Household
            </Button>
          </form>
        </div>

        <div class="flex items-center gap-4">
          <hr class="flex-1 border-stone-300 dark:border-stone-700" />
          <span class="text-sm text-stone-400">or</span>
          <hr class="flex-1 border-stone-300 dark:border-stone-700" />
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Join Household</h2>
          <form method="POST" class="card space-y-3">
            <input type="hidden" name="_method" value="JOIN" />
            {carryRedirect}
            <FormField label="Invite Code">
              <Input
                type="text"
                name="code"
                required
                placeholder="Paste invite code..."
                class="w-full"
              />
            </FormField>
            <Button type="submit">
              Join Household
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
});
