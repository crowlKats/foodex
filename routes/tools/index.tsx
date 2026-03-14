import { page } from "fresh";
import { define } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { FormField } from "../../components/FormField.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";

    let result;
    if (q) {
      result = await ctx.state.db.query(
        `SELECT * FROM tools
         WHERE name ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
         ORDER BY name`,
        [q],
      );
    } else {
      result = await ctx.state.db.query(
        "SELECT * FROM tools ORDER BY name",
      );
    }
    return page({ tools: result.rows, q });
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const description = form.get("description") as string;
    if (!name?.trim()) {
      const result = await ctx.state.db.query(
        "SELECT * FROM tools ORDER BY name",
      );
      return page({ tools: result.rows, error: "Name is required" });
    }
    await ctx.state.db.query(
      "INSERT INTO tools (name, description) VALUES ($1, $2)",
      [name.trim(), description?.trim() || null],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: "/tools" },
    });
  },
});

export default define.page<typeof handler>(function ToolsPage({ data }) {
  const { tools, error, q } = data as {
    tools: Record<string, unknown>[];
    error?: string;
    q: string;
  };
  return (
    <div>
      <PageHeader title="Tools" query={q} />

      {error && (
        <div class="alert-error mb-4">
          {error}
        </div>
      )}

      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <h2 class="text-lg font-semibold mb-3">Add Tool</h2>
          <form
            method="POST"
            class="card space-y-3"
          >
            <FormField label="Name">
              <input
                type="text"
                name="name"
                required
                class="w-full"
              />
            </FormField>
            <FormField label="Description">
              <textarea
                name="description"
                rows={3}
                class="w-full"
              />
            </FormField>
            <button
              type="submit"
              class="btn btn-primary"
            >
              Add Tool
            </button>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">
            All Tools ({tools.length})
          </h2>
          {tools.length === 0
            ? <p class="text-stone-500">No tools yet.</p>
            : (
              <div class="space-y-2">
                {tools.map((m) => (
                  <a
                    key={String(m.id)}
                    href={`/tools/${m.id}`}
                    class="block card card-hover"
                  >
                    <div class="font-medium">{String(m.name)}</div>
                    {m.description && (
                      <div class="text-sm text-stone-500 truncate">
                        {String(m.description)}
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
