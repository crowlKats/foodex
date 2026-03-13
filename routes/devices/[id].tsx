import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import ConfirmButton from "../../islands/ConfirmButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = parseInt(ctx.params.id);
    const deviceRes = await ctx.state.db.query(
      "SELECT * FROM devices WHERE id = $1",
      [id],
    );
    if (deviceRes.rows.length === 0) throw new HttpError(404);

    const usageRes = await ctx.state.db.query(
      `SELECT rd.*, r.title as recipe_title, r.slug as recipe_slug
       FROM recipe_devices rd
       JOIN recipes r ON r.id = rd.recipe_id
       WHERE rd.device_id = $1
       ORDER BY r.title`,
      [id],
    );

    return page({ device: deviceRes.rows[0], usage: usageRes.rows });
  },
  async POST(ctx) {
    const id = parseInt(ctx.params.id);
    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM devices WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/devices" },
      });
    }

    const name = form.get("name") as string;
    const description = form.get("description") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/devices/${id}` },
      });
    }
    await ctx.state.db.query(
      "UPDATE devices SET name = $1, description = $2 WHERE id = $3",
      [name.trim(), description?.trim() || null, id],
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/devices/${id}` },
    });
  },
});

export default define.page<typeof handler>(function DeviceDetail({ data }) {
  const { device, usage } = data as {
    device: Record<string, unknown>;
    usage: Record<string, unknown>[];
  };
  return (
    <div>
      <a href="/devices" class="text-blue-600 hover:underline text-sm">
        &larr; Back to Devices
      </a>

      <div class="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <h1 class="text-2xl font-bold mb-4">Edit Device</h1>
          <form
            method="POST"
            class="bg-white rounded-lg shadow p-4 space-y-3"
          >
            <div>
              <label class="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={String(device.name)}
                required
                class="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <textarea
                name="description"
                rows={4}
                class="w-full border rounded px-3 py-2"
              >
                {String(device.description ?? "")}
              </textarea>
            </div>
            <button
              type="submit"
              class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Save
            </button>
          </form>

          <form method="POST" class="mt-4">
            <input type="hidden" name="_method" value="DELETE" />
            <ConfirmButton
              message="Delete this device?"
              class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Delete Device
            </ConfirmButton>
          </form>
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">Used in Recipes</h2>
          {usage.length === 0
            ? <p class="text-gray-500">Not used in any recipes yet.</p>
            : (
              <div class="space-y-2">
                {usage.map((u) => (
                  <a
                    key={String(u.id)}
                    href={`/recipes/${u.recipe_slug}`}
                    class="block bg-white rounded-lg shadow p-3 hover:shadow-md transition"
                  >
                    <div class="font-medium">{String(u.recipe_title)}</div>
                    {u.usage_description && (
                      <div class="text-sm text-gray-500">
                        {String(u.usage_description)}
                      </div>
                    )}
                    {u.settings && (
                      <div class="text-sm text-gray-400">
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
