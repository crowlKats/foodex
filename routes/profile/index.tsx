import { handler, page } from "./$index.ts";
import type { Household } from "../../db/types.ts";
import { Button } from "../../components/Button.tsx";
import { Select } from "../../components/Select.tsx";

/** Sections the mobile tab bar has no room for. */
const MORE_LINKS = [
  { href: "/agent", label: "Assistant", detail: "ask about your kitchen" },
  { href: "/collections", label: "Collections", detail: "grouped recipes" },
  {
    href: "/ingredients",
    label: "Ingredients",
    detail: "the shared catalog",
  },
  { href: "/stores", label: "Stores", detail: "shops and prices" },
  { href: "/tools", label: "Tools", detail: "your cookware" },
  { href: "/docs/guide", label: "User guide", detail: "how Foodex works" },
];

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    let householdName: string | null = null;
    if (ctx.state.householdId) {
      const res = await ctx.state.db.query<Pick<Household, "name">>(
        "SELECT name FROM households WHERE id = $1",
        [ctx.state.householdId],
      );
      if (res.rows.length > 0) {
        householdName = res.rows[0].name;
      }
    }

    ctx.state.pageTitle = "Profile";
    return { data: { householdName } };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const unitSystem = form.get("unit_system");

    if (unitSystem === "metric" || unitSystem === "imperial") {
      await ctx.state.db.query(
        "UPDATE users SET unit_system = $1 WHERE id = $2",
        [unitSystem, ctx.state.user.id],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/profile" },
    });
  },
});

export default page(
  function ProfilePage({ data, state }) {
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
            {user.email && <p class="text-sm text-stone-500">{user.email}</p>}
          </div>
        </div>

        <div class="card mb-4">
          <h2 class="text-lg font-semibold mb-3">Preferences</h2>
          <form method="POST">
            <label class="text-sm font-medium block mb-1">Unit system</label>
            <div class="flex gap-2">
              <Select name="unit_system" class="flex-1">
                <option value="metric" selected={state.unitSystem === "metric"}>
                  Metric (g, ml, cm)
                </option>
                <option
                  value="imperial"
                  selected={state.unitSystem === "imperial"}
                >
                  Imperial (oz, fl oz, inch)
                </option>
              </Select>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </div>

        {data.householdName && (
          <div class="card mb-4">
            <h2 class="text-lg font-semibold mb-2">Household</h2>
            <a
              href="/household"
              class="link"
            >
              {data.householdName}
            </a>
          </div>
        )}

        {
          /*
          The mobile tab bar only fits the six core destinations, and the top
          bar has room for icons, so Assistant, Ingredients, Stores and Tools
          had no route at all on a phone. The avatar leads here, so this is
          where the rest of the app lives.
        */
        }
        <div class="card mb-4 sm:hidden">
          <h2 class="text-lg font-semibold mb-2">More</h2>
          <ul class="space-y-1">
            {MORE_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} class="link">{l.label}</a>
                <span class="text-stone-500 text-sm">{` — ${l.detail}`}</span>
              </li>
            ))}
          </ul>
        </div>

        {
          /* Sign out lived only in the desktop header, so on a phone there was
            no way to sign out at all. */
        }
        <form method="POST" action="/auth/logout">
          <Button type="submit" variant="danger-outline" class="w-full">
            Sign out
          </Button>
        </form>
      </div>
    );
  },
);
