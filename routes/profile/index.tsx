import { page } from "fresh";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    let householdName: string | null = null;
    if (ctx.state.householdId) {
      const res = await ctx.state.db.query(
        "SELECT name FROM households WHERE id = $1",
        [ctx.state.householdId],
      );
      if (res.rows.length > 0) {
        householdName = res.rows[0].name as string;
      }
    }

    return page({ householdName });
  },
});

export default define.page<typeof handler>(function ProfilePage({ data, state }) {
  const { householdName } = data as { householdName: string | null };
  const user = state.user!;

  return (
    <div class="max-w-md mx-auto">
      <div class="flex items-center gap-4 mb-6">
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt={user.name}
            class="size-16 rounded-full"
          />
        )}
        <div>
          <h1 class="text-2xl font-bold">{user.name}</h1>
          {user.email && (
            <p class="text-sm text-stone-500">{user.email}</p>
          )}
        </div>
      </div>

      {householdName && (
        <div class="card">
          <h2 class="text-lg font-semibold mb-2">Household</h2>
          <a
            href={`/households/${state.householdId}`}
            class="link"
          >
            {householdName}
          </a>
        </div>
      )}
    </div>
  );
});
