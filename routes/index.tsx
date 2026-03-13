import { page } from "fresh";
import { define } from "../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const [recipesRes, groceriesRes, storesRes, devicesRes, recentRes] =
      await Promise.all([
        ctx.state.db.query("SELECT COUNT(*) as count FROM recipes"),
        ctx.state.db.query("SELECT COUNT(*) as count FROM groceries"),
        ctx.state.db.query("SELECT COUNT(*) as count FROM stores"),
        ctx.state.db.query("SELECT COUNT(*) as count FROM devices"),
        ctx.state.db.query(
          "SELECT title, slug, description, updated_at FROM recipes ORDER BY updated_at DESC LIMIT 5",
        ),
      ]);
    return page({
      counts: {
        recipes: recipesRes.rows[0].count,
        groceries: groceriesRes.rows[0].count,
        stores: storesRes.rows[0].count,
        devices: devicesRes.rows[0].count,
      },
      recent: recentRes.rows,
    });
  },
});

export default define.page<typeof handler>(function Home({ data }) {
  const { counts, recent } = data as {
    counts: Record<string, number>;
    recent: Record<string, unknown>[];
  };

  const cards = [
    {
      title: "Recipes",
      count: counts.recipes,
      href: "/recipes",
      color: "bg-green-100 text-green-800",
    },
    {
      title: "Groceries",
      count: counts.groceries,
      href: "/groceries",
      color: "bg-blue-100 text-blue-800",
    },
    {
      title: "Stores",
      count: counts.stores,
      href: "/stores",
      color: "bg-yellow-100 text-yellow-800",
    },
    {
      title: "Devices",
      count: counts.devices,
      href: "/devices",
      color: "bg-purple-100 text-purple-800",
    },
  ];

  return (
    <div>
      <h1 class="text-3xl font-bold mb-6">Foodex</h1>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <a
            key={c.title}
            href={c.href}
            class={`${c.color} rounded-lg p-4 hover:shadow-md transition`}
          >
            <div class="text-3xl font-bold">{String(c.count)}</div>
            <div class="text-sm font-medium">{c.title}</div>
          </a>
        ))}
      </div>

      <h2 class="text-xl font-semibold mb-3">Recent Recipes</h2>
      {recent.length === 0
        ? (
          <p class="text-gray-500">
            No recipes yet.{" "}
            <a href="/recipes" class="text-blue-600 hover:underline">
              Create one
            </a>.
          </p>
        )
        : (
          <div class="space-y-2">
            {recent.map((r) => (
              <a
                key={String(r.slug)}
                href={`/recipes/${r.slug}`}
                class="block bg-white rounded-lg shadow p-4 hover:shadow-md transition"
              >
                <div class="font-medium">{String(r.title)}</div>
                {r.description && (
                  <div class="text-sm text-gray-500">
                    {String(r.description)}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
    </div>
  );
});
