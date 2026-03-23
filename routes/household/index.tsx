import { page } from "fresh";
import { define, escapeLike } from "../../utils.ts";
import { FormField } from "../../components/FormField.tsx";
import { SearchBar } from "../../components/SearchBar.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import CopyButton from "../../islands/CopyButton.tsx";
import TbTrash from "tb-icons/TbTrash";
import TbClock from "tb-icons/TbClock";
import TbFlame from "tb-icons/TbFlame";
import TbUsers from "tb-icons/TbUsers";
import { formatDuration } from "../../lib/duration.ts";
import { formatQuantity } from "../../lib/quantity.ts";
import type { RecipeQuantity } from "../../lib/quantity.ts";
import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
  RecipeListItem,
  RecipeTag,
  RecipeWithCover,
  StoreWithOwned,
  ToolWithOwned,
} from "../../db/types.ts";

function generateInviteCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = ctx.state.householdId;

    const memberCheck = await ctx.state.db.query<Pick<HouseholdMember, "role">>(
      "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }
    const myRole = memberCheck.rows[0].role;
    const q = ctx.url.searchParams.get("q")?.trim() || "";

    const [
      householdRes,
      membersRes,
      invitesRes,
      toolsRes,
      storesRes,
      recipesRes,
    ] = await Promise.all([
      ctx.state.db.query<Household>("SELECT * FROM households WHERE id = $1", [
        id,
      ]),
      ctx.state.db.query<HouseholdMember>(
        `SELECT hm.*, u.name, u.email, u.avatar_url
           FROM household_members hm
           JOIN users u ON u.id = hm.user_id
           WHERE hm.household_id = $1
           ORDER BY hm.role DESC, u.name`,
        [id],
      ),
      ctx.state.db.query<HouseholdInvite>(
        `SELECT * FROM household_invites
           WHERE household_id = $1 AND expires_at > now()
           ORDER BY created_at DESC`,
        [id],
      ),
      ctx.state.db.query<ToolWithOwned>(
        `SELECT t.id, t.name,
                  (EXISTS (SELECT 1 FROM household_tools ht WHERE ht.tool_id = t.id AND ht.household_id = $1)) as owned
           FROM tools t ORDER BY t.name`,
        [id],
      ),
      ctx.state.db.query<StoreWithOwned>(
        `SELECT s.id, s.name,
                  (EXISTS (SELECT 1 FROM household_stores hs WHERE hs.store_id = s.id AND hs.household_id = $1)) as owned
           FROM stores s ORDER BY s.name`,
        [id],
      ),
      ctx.state.db.query<RecipeWithCover>(
        `SELECT r.*, m.url as cover_image_url FROM recipes r
           LEFT JOIN media m ON m.id = r.cover_image_id
           WHERE r.household_id = $1
           ${
          q
            ? `AND (r.search_vector @@ plainto_tsquery('english', $2) OR r.title ILIKE '%' || $3 || '%' ESCAPE '\\\\')`
            : ""
        }
           ORDER BY r.updated_at DESC`,
        q ? [id, q, escapeLike(q)] : [id],
      ),
    ]);

    const allTools = toolsRes.rows;
    const tools = allTools.filter((t) => t.owned);
    const availableTools = allTools.filter((t) => !t.owned);

    const allStores = storesRes.rows;
    const stores = allStores.filter((s) => s.owned);
    const availableStores = allStores.filter((s) => !s.owned);

    const recipeIds = recipesRes.rows.map((r) => r.id);
    const tagsMap: Record<string, { meal_types: string[]; dietary: string[] }> =
      {};
    if (recipeIds.length > 0) {
      const tagsRes = await ctx.state.db.query<RecipeTag>(
        "SELECT recipe_id, tag_type, tag_value FROM recipe_tags WHERE recipe_id = ANY($1)",
        [recipeIds],
      );
      for (const t of tagsRes.rows) {
        if (!tagsMap[t.recipe_id]) {
          tagsMap[t.recipe_id] = { meal_types: [], dietary: [] };
        }
        if (t.tag_type === "meal_type") {
          tagsMap[t.recipe_id].meal_types.push(t.tag_value);
        } else if (t.tag_type === "dietary") {
          tagsMap[t.recipe_id].dietary.push(t.tag_value);
        }
      }
    }
    const recipes: RecipeListItem[] = recipesRes.rows.map((r) => ({
      ...r,
      tags: tagsMap[r.id] ?? { meal_types: [], dietary: [] },
    }));

    ctx.state.pageTitle = householdRes.rows[0].name as string;
    return page({
      household: householdRes.rows[0],
      members: membersRes.rows,
      invites: invitesRes.rows,
      tools,
      availableTools,
      stores,
      availableStores,
      recipes,
      myRole,
      q,
    });
  },
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = ctx.state.householdId;
    const form = await ctx.req.formData();
    const method = form.get("_method");

    const memberCheck = await ctx.state.db.query<Pick<HouseholdMember, "role">>(
      "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }
    const myRole = memberCheck.rows[0].role;

    if (method === "ADD_TOOL") {
      const toolId = String(form.get("tool_id"));
      if (toolId) {
        await ctx.state.db.query(
          "INSERT INTO household_tools (household_id, tool_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, toolId],
        );
      }
    } else if (method === "REMOVE_TOOL") {
      const toolId = String(form.get("tool_id"));
      if (toolId) {
        await ctx.state.db.query(
          "DELETE FROM household_tools WHERE household_id = $1 AND tool_id = $2",
          [id, toolId],
        );
      }
    } else if (method === "ADD_STORE") {
      const storeId = String(form.get("store_id"));
      if (storeId) {
        await ctx.state.db.query(
          "INSERT INTO household_stores (household_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, storeId],
        );
      }
    } else if (method === "REMOVE_STORE") {
      const storeId = String(form.get("store_id"));
      if (storeId) {
        await ctx.state.db.query(
          "DELETE FROM household_stores WHERE household_id = $1 AND store_id = $2",
          [id, storeId],
        );
      }
    } else if (method === "CREATE_INVITE" && myRole === "owner") {
      const code = generateInviteCode();
      await ctx.state.db.query(
        "INSERT INTO household_invites (household_id, code, created_by) VALUES ($1, $2, $3)",
        [id, code, ctx.state.user.id],
      );
    } else if (method === "REVOKE_INVITE" && myRole === "owner") {
      const inviteId = String(form.get("invite_id"));
      await ctx.state.db.query(
        "DELETE FROM household_invites WHERE id = $1 AND household_id = $2",
        [inviteId, id],
      );
    } else if (method === "REMOVE_MEMBER" && myRole === "owner") {
      const memberId = String(form.get("member_user_id"));
      if (memberId !== ctx.state.user.id) {
        await ctx.state.db.query(
          "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
          [id, memberId],
        );
      }
    } else if (method === "LEAVE") {
      if (myRole !== "owner") {
        await ctx.state.db.query(
          "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
          [id, ctx.state.user.id],
        );
        return new Response(null, {
          status: 303,
          headers: { Location: "/households" },
        });
      }
    } else if (method === "UPDATE_NAME" && myRole === "owner") {
      const name = form.get("name") as string;
      if (name?.trim()) {
        await ctx.state.db.query(
          "UPDATE households SET name = $1, updated_at = now() WHERE id = $2",
          [name.trim(), id],
        );
      }
    } else if (method === "DELETE" && myRole === "owner") {
      await ctx.state.db.query("DELETE FROM households WHERE id = $1", [id]);
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/household" },
    });
  },
});

export default define.page<typeof handler>(function HouseholdDetailPage(
  {
    data: {
      household,
      members,
      invites,
      tools,
      availableTools,
      stores,
      availableStores,
      recipes,
      myRole,
      q,
    },
    state,
    url,
  },
) {
  const isOwner = myRole === "owner";

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">{household.name}</h1>
        <a href="/household/pantry" class="btn btn-primary">
          Pantry
        </a>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        {/* ── Left column: Recipes ── */}
        <div class="lg:col-span-2 space-y-6">
          <div>
            <div class="flex items-center gap-3 mb-3">
              <h2 class="text-lg font-semibold shrink-0">
                Recipes ({recipes.length})
              </h2>
              <div class="flex-1">
                <SearchBar
                  query={q}
                  placeholder="Search recipes..."
                />
              </div>
              <a href="/recipes/new" class="btn btn-primary text-sm shrink-0">
                New Recipe
              </a>
            </div>
            {recipes.length === 0
              ? (
                <p class="text-stone-500 text-sm">
                  {q ? "No recipes found." : "No recipes yet."}
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
                            src={r.cover_image_url}
                            alt={r.title}
                            class="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <div>
                          <div class="font-medium text-lg">
                            {r.title}
                            {r.private && (
                              <span class="ml-2 text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded align-middle">
                                private
                              </span>
                            )}
                          </div>
                          {r.description && (
                            <div class="text-sm text-stone-500 mt-1">
                              {r.description}
                            </div>
                          )}
                          {(r.tags.meal_types.length > 0 ||
                            r.tags.dietary.length > 0) && (
                            <div class="flex flex-wrap gap-1 mt-1">
                              {r.tags.meal_types.map((mt) => (
                                <span
                                  key={mt}
                                  class="text-[10px] bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded capitalize"
                                >
                                  {mt}
                                </span>
                              ))}
                              {r.tags.dietary.map((dt) => (
                                <span
                                  key={dt}
                                  class="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded capitalize"
                                >
                                  {dt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div class="text-xs text-stone-400 mt-2 flex gap-4">
                        {r.difficulty && (
                          <span class="capitalize">{r.difficulty}</span>
                        )}
                        <span>
                          <TbUsers class="size-3.5 inline mr-0.5" />
                          {formatQuantity({
                            type:
                              (r.quantity_type || "servings") as RecipeQuantity[
                                "type"
                              ],
                            value: r.quantity_value ?? 4,
                            unit: r.quantity_unit || "servings",
                            value2: r.quantity_value2 != null
                              ? r.quantity_value2
                              : undefined,
                            value3: r.quantity_value3 != null
                              ? r.quantity_value3
                              : undefined,
                            unit2: r.quantity_unit2 ?? undefined,
                          })}
                        </span>
                        {r.prep_time != null && (
                          <span>
                            <TbClock class="size-3.5 inline mr-0.5" />Prep:{" "}
                            {formatDuration(r.prep_time)}
                          </span>
                        )}
                        {r.cook_time != null && (
                          <span>
                            <TbFlame class="size-3.5 inline mr-0.5" />Cook:{" "}
                            {formatDuration(r.cook_time)}
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
          </div>

          <div class="flex flex-col sm:flex-row sm:items-start gap-6 sm:[&>*]:flex-1">
            {/* ── Tools ── */}
            <div class="card">
              <h2 class="text-lg font-semibold mb-3">
                Tools ({tools.length})
              </h2>
              {tools.length > 0
                ? (
                  <div class="space-y-1.5 mb-3">
                    {tools.map((t) => (
                      <div
                        key={t.id}
                        class="flex items-center justify-between text-sm"
                      >
                        <a href={`/tools/${t.id}`} class="link">
                          {t.name}
                        </a>
                        <form method="POST" class="inline">
                          <input
                            type="hidden"
                            name="_method"
                            value="REMOVE_TOOL"
                          />
                          <input
                            type="hidden"
                            name="tool_id"
                            value={t.id}
                          />
                          <button
                            type="submit"
                            class="text-stone-400 hover:text-red-500 cursor-pointer text-xs"
                            title="Remove"
                          >
                            <TbTrash class="size-3.5" />
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )
                : (
                  <p class="text-stone-500 text-sm mb-3">
                    No tools added yet.
                  </p>
                )}
              <form method="POST" class="flex gap-2">
                <input type="hidden" name="_method" value="ADD_TOOL" />
                <select name="tool_id" class="flex-1 text-sm">
                  <option value="">Add a tool...</option>
                  {availableTools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="submit" class="btn btn-primary text-sm">
                  Add
                </button>
              </form>
            </div>

            {/* ── Stores ── */}
            <div class="card">
              <h2 class="text-lg font-semibold mb-3">
                Stores ({stores.length})
              </h2>
              {stores.length > 0
                ? (
                  <div class="space-y-1.5 mb-3">
                    {stores.map((s) => (
                      <div
                        key={s.id}
                        class="flex items-center justify-between text-sm"
                      >
                        <a href={`/stores/${s.id}`} class="link">
                          {s.name}
                        </a>
                        <form method="POST" class="inline">
                          <input
                            type="hidden"
                            name="_method"
                            value="REMOVE_STORE"
                          />
                          <input
                            type="hidden"
                            name="store_id"
                            value={s.id}
                          />
                          <button
                            type="submit"
                            class="text-stone-400 hover:text-red-500 cursor-pointer text-xs"
                            title="Remove"
                          >
                            <TbTrash class="size-3.5" />
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )
                : (
                  <p class="text-stone-500 text-sm mb-3">
                    No stores added yet.
                  </p>
                )}
              <form method="POST" class="flex gap-2">
                <input type="hidden" name="_method" value="ADD_STORE" />
                <select name="store_id" class="flex-1 text-sm">
                  <option value="">Add a store...</option>
                  {availableStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button type="submit" class="btn btn-primary text-sm">
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ── Right column: Members & Admin ── */}
        <div class="space-y-6">
          <div class="card space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-3">
                Members ({members.length})
              </h2>
              <div class="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    class="flex items-center gap-3"
                  >
                    {m.avatar_url && (
                      <img
                        src={m.avatar_url}
                        alt={m.name}
                        class="size-8 rounded-full"
                      />
                    )}
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-sm">
                        {m.name}
                        {m.user_id === state.user!.id && (
                          <span class="text-xs text-stone-400 ml-1">
                            (you)
                          </span>
                        )}
                      </div>
                      {m.email && (
                        <div class="text-xs text-stone-500 truncate">
                          {m.email}
                        </div>
                      )}
                    </div>
                    <span
                      class={`text-xs px-2 py-0.5 rounded shrink-0 ${
                        m.role === "owner"
                          ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
                          : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                      }`}
                    >
                      {m.role}
                    </span>
                    {isOwner && m.user_id !== state.user!.id && (
                      <form method="POST" class="inline shrink-0">
                        <input
                          type="hidden"
                          name="_method"
                          value="REMOVE_MEMBER"
                        />
                        <input
                          type="hidden"
                          name="member_user_id"
                          value={m.user_id}
                        />
                        <button
                          type="submit"
                          class="text-red-500 hover:text-red-700 p-1"
                          title="Remove member"
                        >
                          <TbTrash class="size-4" />
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
              {!isOwner && (
                <form method="POST" class="mt-4">
                  <input type="hidden" name="_method" value="LEAVE" />
                  <button
                    type="submit"
                    class="btn text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950 w-full"
                  >
                    Leave Household
                  </button>
                </form>
              )}
            </div>

            {isOwner && (
              <>
                <hr class="border-stone-300 dark:border-stone-700" />

                <div>
                  <h2 class="text-lg font-semibold mb-3">Invite Link</h2>
                  <p class="text-xs text-stone-500 mb-3">
                    Share a link so others can join. Links expire after 7 days.
                  </p>

                  {invites.length > 0 && (
                    <div class="space-y-2 mb-3">
                      {invites.map((inv) => {
                        const inviteUrl =
                          `${url.origin}/households/join/${inv.code}`;
                        return (
                          <div
                            key={inv.id}
                            class="flex items-center gap-2 text-sm bg-stone-50 dark:bg-stone-800 p-2 border border-stone-200 dark:border-stone-700"
                          >
                            <input
                              type="text"
                              readOnly
                              value={inviteUrl}
                              class="flex-1 text-xs bg-transparent border-none p-0 h-auto"
                            />
                            <CopyButton text={inviteUrl} />
                            <form method="POST" class="inline">
                              <input
                                type="hidden"
                                name="_method"
                                value="REVOKE_INVITE"
                              />
                              <input
                                type="hidden"
                                name="invite_id"
                                value={inv.id}
                              />
                              <button
                                type="submit"
                                class="text-red-500 hover:text-red-700 p-1"
                                title="Revoke"
                              >
                                <TbTrash class="size-3.5" />
                              </button>
                            </form>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <form method="POST">
                    <input
                      type="hidden"
                      name="_method"
                      value="CREATE_INVITE"
                    />
                    <button type="submit" class="btn btn-primary w-full">
                      Generate Invite Link
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          {isOwner && (
            <div class="card space-y-6">
              <div>
                <h2 class="text-lg font-semibold mb-3">Settings</h2>
                <form method="POST" class="space-y-3">
                  <input type="hidden" name="_method" value="UPDATE_NAME" />
                  <FormField label="Household Name">
                    <input
                      type="text"
                      name="name"
                      value={household.name}
                      required
                      class="w-full"
                    />
                  </FormField>
                  <button type="submit" class="btn btn-primary">
                    Update
                  </button>
                </form>
              </div>

              <hr class="border-stone-300 dark:border-stone-700" />

              <div>
                <h2 class="text-lg font-semibold mb-3 text-red-600">
                  Danger Zone
                </h2>
                <form method="POST">
                  <input type="hidden" name="_method" value="DELETE" />
                  <ConfirmButton
                    message="Delete this household? This cannot be undone."
                    class="btn btn-danger w-full"
                  >
                    Delete Household
                  </ConfirmButton>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
