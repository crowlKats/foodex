import { page } from "fresh";
import { define } from "../../utils.ts";
import { formatDuration } from "../../lib/duration.ts";
import { formatQuantity } from "../../lib/quantity.ts";
import type { RecipeQuantity } from "../../lib/quantity.ts";
import TbClock from "tb-icons/TbClock";
import TbFlame from "tb-icons/TbFlame";
import TbUsers from "tb-icons/TbUsers";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const recipesRes = await ctx.state.db.query(
      `SELECT r.*, m.url as cover_image_url FROM recipes r
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE r.user_id = $1
       ORDER BY r.updated_at DESC`,
      [ctx.state.user.id],
    );

    const toolsRes = await ctx.state.db.query(
      `SELECT t.* FROM tools t
       JOIN user_tools ut ON ut.tool_id = t.id
       WHERE ut.user_id = $1
       ORDER BY t.name`,
      [ctx.state.user.id],
    );

    const allStoresRes = await ctx.state.db.query(
      "SELECT id, name FROM stores ORDER BY name",
    );

    const userStoresRes = await ctx.state.db.query(
      "SELECT store_id FROM user_stores WHERE user_id = $1",
      [ctx.state.user.id],
    );
    const userStoreIds = new Set(
      userStoresRes.rows.map((r) => Number(r.store_id)),
    );

    return page({
      recipes: recipesRes.rows,
      tools: toolsRes.rows,
      allStores: allStoresRes.rows,
      userStoreIds: [...userStoreIds],
    });
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const method = form.get("_method");

    if (method === "TOGGLE_STORE") {
      const storeId = parseInt(form.get("store_id") as string);
      const existing = await ctx.state.db.query(
        "SELECT 1 FROM user_stores WHERE user_id = $1 AND store_id = $2",
        [ctx.state.user.id, storeId],
      );
      if (existing.rows.length > 0) {
        await ctx.state.db.query(
          "DELETE FROM user_stores WHERE user_id = $1 AND store_id = $2",
          [ctx.state.user.id, storeId],
        );
      } else {
        await ctx.state.db.query(
          "INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2)",
          [ctx.state.user.id, storeId],
        );
      }
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/profile" },
    });
  },
});

export default define.page<typeof handler>(function ProfilePage({ data, state }) {
  const { recipes, tools, allStores, userStoreIds } = data as {
    recipes: Record<string, unknown>[];
    tools: Record<string, unknown>[];
    allStores: Record<string, unknown>[];
    userStoreIds: number[];
  };
  const user = state.user!;
  const storeSet = new Set(userStoreIds);

  return (
    <div>
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

      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <h2 class="text-lg font-semibold mb-3">
            My Recipes ({recipes.length})
          </h2>
          {recipes.length === 0
            ? (
              <p class="text-stone-500">
                No recipes yet.{" "}
                <a href="/recipes/new" class="link">Create one</a>
              </p>
            )
            : (
              <div class="space-y-2">
                {recipes.map((r) => (
                  <a
                    key={String(r.id)}
                    href={`/recipes/${r.slug}`}
                    class="block card card-hover"
                  >
                    <div class="flex items-center gap-3">
                      {r.cover_image_url && (
                        <img
                          src={String(r.cover_image_url)}
                          alt={String(r.title)}
                          class="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <div class="font-medium text-lg">
                          {String(r.title)}
                        </div>
                        {r.description && (
                          <div class="text-sm text-stone-500 mt-1">
                            {String(r.description)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div class="text-xs text-stone-400 mt-2 flex gap-4">
                      <span>
                        <TbUsers class="size-3.5 inline mr-0.5" />
                        {formatQuantity({
                          type: String(
                            r.quantity_type || "servings",
                          ) as RecipeQuantity["type"],
                          value: Number(r.quantity_value ?? 4),
                          unit: String(r.quantity_unit || "servings"),
                          value2: r.quantity_value2 != null
                            ? Number(r.quantity_value2)
                            : undefined,
                          value3: r.quantity_value3 != null
                            ? Number(r.quantity_value3)
                            : undefined,
                          unit2: r.quantity_unit2
                            ? String(r.quantity_unit2)
                            : undefined,
                        })}
                      </span>
                      {r.prep_time != null && (
                        <span>
                          <TbClock class="size-3.5 inline mr-0.5" />Prep:{" "}
                          {formatDuration(Number(r.prep_time))}
                        </span>
                      )}
                      {r.cook_time != null && (
                        <span>
                          <TbFlame class="size-3.5 inline mr-0.5" />Cook:{" "}
                          {formatDuration(Number(r.cook_time))}
                        </span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
        </div>

        <div class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-3">
              My Stores ({userStoreIds.length})
            </h2>
            <p class="text-xs text-stone-500 mb-2">
              Select which stores are available to you. This filters your
              shopping list.
            </p>
            <div class="space-y-1">
              {allStores.map((s) => {
                const active = storeSet.has(s.id as number);
                return (
                  <form
                    key={String(s.id)}
                    method="POST"
                    class="inline"
                  >
                    <input type="hidden" name="_method" value="TOGGLE_STORE" />
                    <input
                      type="hidden"
                      name="store_id"
                      value={String(s.id)}
                    />
                    <button
                      type="submit"
                      class={`block w-full text-left px-3 py-2 text-sm border-2 cursor-pointer transition-colors ${
                        active
                          ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-950"
                          : "border-stone-300 dark:border-stone-700 hover:border-stone-400"
                      }`}
                    >
                      <span class="font-medium">{String(s.name)}</span>
                      {active && (
                        <span class="text-xs text-green-600 dark:text-green-400 ml-2">
                          active
                        </span>
                      )}
                    </button>
                  </form>
                );
              })}
              {allStores.length === 0 && (
                <p class="text-stone-500 text-sm">
                  No stores yet.{" "}
                  <a href="/stores" class="link">Add one</a>
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 class="text-lg font-semibold mb-3">
              My Tools ({tools.length})
            </h2>
            {tools.length === 0
              ? <p class="text-stone-500">No tools marked yet.</p>
              : (
                <div class="space-y-2">
                  {tools.map((t) => (
                    <a
                      key={String(t.id)}
                      href={`/tools/${t.id}`}
                      class="block card card-hover"
                    >
                      <div class="font-medium">{String(t.name)}</div>
                      {t.description && (
                        <div class="text-sm text-stone-500 truncate">
                          {String(t.description)}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});
