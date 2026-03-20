import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = parseInt(ctx.params.id);
    const toolRes = await ctx.state.db.query(
      "SELECT * FROM tools WHERE id = $1 AND household_id = $2",
      [id, ctx.state.householdId],
    );
    if (toolRes.rows.length === 0) throw new HttpError(404);

    const usageRes = await ctx.state.db.query(
      `SELECT rt.*, r.title as recipe_title, r.slug as recipe_slug
       FROM recipe_tools rt
       JOIN recipes r ON r.id = rt.recipe_id
       WHERE rt.tool_id = $1
       ORDER BY r.title`,
      [id],
    );

    return page({
      tool: toolRes.rows[0],
      usage: usageRes.rows,
    });
  },
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = parseInt(ctx.params.id);

    // Verify tool belongs to household
    const toolRes = await ctx.state.db.query(
      "SELECT 1 FROM tools WHERE id = $1 AND household_id = $2",
      [id, ctx.state.householdId],
    );
    if (toolRes.rows.length === 0) throw new HttpError(404);

    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM tools WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/tools" },
      });
    }

    const name = form.get("name") as string;
    const description = form.get("description") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/tools/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE tools SET name = $1, description = $2 WHERE id = $3",
      [name.trim(), description?.trim() || null, id],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/tools/${id}` },
    });
  },
});

export default define.page<typeof handler>(function ToolDetail({ data }) {
  const { tool, usage } = data as {
    tool: Record<string, unknown>;
    usage: Record<string, unknown>[];
  };
  return (
    <div>
      <BackLink href="/tools" label="Back to Tools" />

      <div class="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h1 class="text-2xl font-bold mb-4">Edit Tool</h1>
          <form
            method="POST"
            class="card space-y-3"
          >
            <FormField label="Name">
              <input
                type="text"
                name="name"
                value={String(tool.name)}
                required
                class="w-full"
              />
            </FormField>
            <FormField label="Description">
              <textarea
                name="description"
                rows={4}
                class="w-full"
              >
                {String(tool.description ?? "")}
              </textarea>
            </FormField>
            <button
              type="submit"
              class="btn btn-primary"
            >
              Save
            </button>
          </form>

          <form method="POST" class="mt-4">
            <input type="hidden" name="_method" value="DELETE" />
            <ConfirmButton
              message="Delete this tool?"
              class="btn btn-danger"
            >
              Delete Tool
            </ConfirmButton>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Used in Recipes</h2>
          {usage.length === 0
            ? <p class="text-stone-500">Not used in any recipes yet.</p>
            : (
              <div class="space-y-2">
                {usage.map((u) => (
                  <a
                    key={String(u.id)}
                    href={`/recipes/${u.recipe_slug}`}
                    class="block card card-hover p-3"
                  >
                    <div class="font-medium">{String(u.recipe_title)}</div>
                    {u.usage_description && (
                      <div class="text-sm text-stone-500">
                        {String(u.usage_description)}
                      </div>
                    )}
                    {u.settings && (
                      <div class="text-sm text-stone-400">
                        Settings: {String(u.settings)}
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
