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

    const result = await ctx.state.db.query(
      `SELECT h.*,
        (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = h.id) as member_count,
        hm.role as my_role
       FROM households h
       JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1
       ORDER BY h.name`,
      [ctx.state.user.id],
    );

    return page({ households: result.rows });
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const name = form.get("name") as string;

    if (!name?.trim()) {
      const result = await ctx.state.db.query(
        `SELECT h.*,
          (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = h.id) as member_count,
          hm.role as my_role
         FROM households h
         JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1
         ORDER BY h.name`,
        [ctx.state.user.id],
      );
      return page({ households: result.rows, error: "Name is required" });
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
  const { households, error } = data as {
    households: Record<string, unknown>[];
    error?: string;
  };

  return (
    <div>
      <PageHeader title="Households" />

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 md:grid-cols-2">
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

        <div>
          <h2 class="text-lg font-semibold mb-3">
            My Households ({households.length})
          </h2>
          {households.length === 0
            ? (
              <p class="text-stone-500">
                No households yet. Create one to get started.
              </p>
            )
            : (
              <div class="space-y-2">
                {households.map((h) => (
                  <a
                    key={String(h.id)}
                    href={`/households/${h.id}`}
                    class="block card card-hover"
                  >
                    <div class="font-medium">{String(h.name)}</div>
                    <div class="text-sm text-stone-500">
                      {String(h.member_count)}{" "}
                      member{Number(h.member_count) !== 1 ? "s" : ""}
                      {h.my_role === "owner" && (
                        <span class="ml-2 text-xs text-orange-600 dark:text-orange-400">
                          owner
                        </span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
});
