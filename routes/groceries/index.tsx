import { page } from "fresh";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const result = await ctx.state.db.query(
      "SELECT * FROM groceries ORDER BY name",
    );
    return page({ groceries: result.rows });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const category = form.get("category") as string;
    const unit = form.get("unit") as string;
    if (!name?.trim()) {
      const result = await ctx.state.db.query(
        "SELECT * FROM groceries ORDER BY name",
      );
      return page({ groceries: result.rows, error: "Name is required" });
    }
    await ctx.state.db.query(
      "INSERT INTO groceries (name, category, unit) VALUES ($1, $2, $3)",
      [name.trim(), category?.trim() || null, unit?.trim() || null],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: "/groceries" },
    });
  },
});

export default define.page<typeof handler>(function GroceriesPage({ data }) {
  const { groceries, error } = data as {
    groceries: Record<string, unknown>[];
    error?: string;
  };

  const categories = [
    ...new Set(groceries.map((g) => g.category).filter(Boolean)),
  ];

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Groceries</h1>
      </div>

      {error && (
        <div class="bg-red-100 text-red-700 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <h2 class="text-lg font-semibold mb-3">Add Grocery</h2>
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
              <label class="block text-sm font-medium mb-1">Category</label>
              <input
                type="text"
                name="category"
                list="categories"
                class="w-full border rounded px-3 py-2"
              />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={String(c)} value={String(c)} />
                ))}
              </datalist>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Unit</label>
              <input
                type="text"
                name="unit"
                placeholder="e.g. g, ml, pieces"
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <button
              type="submit"
              class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Add Grocery
            </button>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">
            All Groceries ({groceries.length})
          </h2>
          {groceries.length === 0
            ? <p class="text-gray-500">No groceries yet.</p>
            : (
              <div class="space-y-2">
                {groceries.map((g) => (
                  <a
                    key={String(g.id)}
                    href={`/groceries/${g.id}`}
                    class="block bg-white rounded-lg shadow p-4 hover:shadow-md transition"
                  >
                    <div class="font-medium">{String(g.name)}</div>
                    <div class="text-sm text-gray-500">
                      {g.category && (
                        <span class="mr-2">{String(g.category)}</span>
                      )}
                      {g.unit && <span>({String(g.unit)})</span>}
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
