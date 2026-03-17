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

    return page({
      recipes: recipesRes.rows,
      tools: toolsRes.rows,
    });
  },
});

export default define.page<typeof handler>(function ProfilePage({ data, state }) {
  const { recipes, tools } = data as {
    recipes: Record<string, unknown>[];
    tools: Record<string, unknown>[];
  };
  const user = state.user!;

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
  );
});
