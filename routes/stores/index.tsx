import { page } from "fresh";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const result = await ctx.state.db.query(
      "SELECT * FROM stores ORDER BY name",
    );
    return page({ stores: result.rows });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const location = form.get("location") as string;
    if (!name?.trim()) {
      const result = await ctx.state.db.query(
        "SELECT * FROM stores ORDER BY name",
      );
      return page({ stores: result.rows, error: "Name is required" });
    }
    await ctx.state.db.query(
      "INSERT INTO stores (name, location) VALUES ($1, $2)",
      [name.trim(), location?.trim() || null],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: "/stores" },
    });
  },
});

export default define.page<typeof handler>(function StoresPage({ data }) {
  const { stores, error } = data as {
    stores: Record<string, unknown>[];
    error?: string;
  };
  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Stores</h1>
      </div>

      {error && (
        <div class="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <h2 class="text-lg font-semibold mb-3">Add Store</h2>
          <form method="POST" class="bg-white rounded-lg shadow p-4 space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                name="name"
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                name="location"
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <button
              type="submit"
              class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Add Store
            </button>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">
            All Stores ({stores.length})
          </h2>
          {stores.length === 0
            ? <p class="text-gray-500">No stores yet.</p>
            : (
              <div class="space-y-2">
                {stores.map((s) => (
                  <a
                    key={String(s.id)}
                    href={`/stores/${s.id}`}
                    class="block bg-white rounded-lg shadow p-4 hover:shadow-md transition"
                  >
                    <div class="font-medium">{String(s.name)}</div>
                    {s.location && (
                      <div class="text-sm text-gray-500">
                        {String(s.location)}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
});
