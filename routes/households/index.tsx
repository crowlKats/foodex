import { page } from "fresh";
import { define } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    // If user already belongs to a household, redirect to it
    const result = await ctx.state.db.query(
      `SELECT h.id FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1`,
      [ctx.state.user.id],
    );

    if (result.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/households/${result.rows[0].id}` },
      });
    }

    return page({});
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    // If user already belongs to a household, redirect to it
    const existing = await ctx.state.db.query(
      `SELECT h.id FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1`,
      [ctx.state.user.id],
    );
    if (existing.rows.length > 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/households/${existing.rows[0].id}` },
      });
    }

    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "JOIN") {
      const code = (form.get("code") as string)?.trim();
      if (!code) {
        return page({ error: "Invite code is required" });
      }

      const inviteRes = await ctx.state.db.query(
        `SELECT hi.household_id FROM household_invites hi
         WHERE hi.code = $1 AND hi.expires_at > now()`,
        [code],
      );
      if (inviteRes.rows.length === 0) {
        return page({ error: "Invalid or expired invite code" });
      }

      const householdId = inviteRes.rows[0].household_id;
      await ctx.state.db.query(
        "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')",
        [householdId, ctx.state.user.id],
      );

      return new Response(null, {
        status: 303,
        headers: { Location: `/households/${householdId}` },
      });
    }

    const name = form.get("name") as string;

    if (!name?.trim()) {
      return page({ error: "Name is required" });
    }

    const houseRes = await ctx.state.db.query(
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
      headers: { Location: `/households/${householdId}` },
    });
  },
});

export default define.page<typeof handler>(function HouseholdsPage({ data }) {
  const { error } = data as { error?: string };

  return (
    <div class="max-w-md mx-auto mt-12">
      <PageHeader title="Get Started" />

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
            <FormField label="Name">
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Smith Family"
                class="w-full"
              />
            </FormField>
            <button type="submit" class="btn btn-primary">
              Create Household
            </button>
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
            <FormField label="Invite Code">
              <input
                type="text"
                name="code"
                required
                placeholder="Paste invite code..."
                class="w-full"
              />
            </FormField>
            <button type="submit" class="btn btn-primary">
              Join Household
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});
