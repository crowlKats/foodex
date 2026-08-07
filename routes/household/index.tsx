import { handler, page } from "./$index.ts";
import { escapeLike } from "../../utils.ts";
import { FormField } from "../../components/FormField.tsx";
import { SearchBar } from "../../components/SearchBar.tsx";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { Select } from "../../components/Select.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import ShareButton from "../../islands/ShareButton.tsx";
import { IconTrash } from "@tabler/icons-preact";
import { IconClock } from "@tabler/icons-preact";
import { IconFlame } from "@tabler/icons-preact";
import { IconZzz } from "@tabler/icons-preact";
import { IconUsers } from "@tabler/icons-preact";
import { logAudit } from "../../lib/audit.ts";
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
import { generateInviteCode } from "../../lib/auth.ts";

export const handlers = handler({
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
            ? `AND (r.search_vector @@ plainto_tsquery('english', $2) OR r.title ILIKE '%' || $3 || '%' ESCAPE '\\')`
            : ""
        }
           ORDER BY r.updated_at DESC`,
        q ? [id, q, escapeLike(q)] : [id],
      ),
    ]);

    // At-a-glance kitchen state, so the dashboard says something about today
    // rather than only listing what the household owns.
    const kitchenRes = await ctx.state.db.query<{
      pantry_count: number;
      expiring_count: number;
      planned_count: number;
      cooked_this_month: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM pantry_items WHERE household_id = $1) AS pantry_count,
         (SELECT COUNT(*)::int FROM pantry_items
           WHERE household_id = $1 AND NOT staple
             AND expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + 3) AS expiring_count,
         (SELECT COUNT(*)::int FROM plan_entries
           WHERE household_id = $1 AND status = 'planned') AS planned_count,
         (SELECT COUNT(*)::int FROM plan_entries
           WHERE household_id = $1 AND status = 'cooked'
             AND cooked_at > now() - interval '30 days') AS cooked_this_month`,
      [id],
    );
    const kitchen = kitchenRes.rows[0];

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
    return {
      data: {
        kitchen,
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
        error: ctx.url.searchParams.get("error") || undefined,
      },
    };
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

    const memberCheck = await ctx.state.db.query<
      Pick<HouseholdMember, "role"> & { household_name: string }
    >(
      `SELECT hm.role, h.name as household_name
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.household_id = $1 AND hm.user_id = $2`,
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }
    const myRole = memberCheck.rows[0].role;
    const householdName = memberCheck.rows[0].household_name;

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
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.create_invite",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: id,
      });
    } else if (method === "REVOKE_INVITE" && myRole === "owner") {
      const inviteId = String(form.get("invite_id"));
      await ctx.state.db.query(
        "DELETE FROM household_invites WHERE id = $1 AND household_id = $2",
        [inviteId, id],
      );
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.revoke_invite",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: id,
      });
    } else if (method === "REMOVE_MEMBER" && myRole === "owner") {
      const memberId = String(form.get("member_user_id"));
      if (memberId !== ctx.state.user.id) {
        const memberRes = await ctx.state.db.query<{
          name: string | null;
          email: string | null;
        }>("SELECT name, email FROM users WHERE id = $1", [memberId]);
        const member = memberRes.rows[0];
        await ctx.state.db.query(
          "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
          [id, memberId],
        );
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "household.remove_member",
          targetType: "household",
          targetId: id,
          targetLabel: householdName,
          detail: member
            ? `removed ${member.name ?? "(no name)"} <${
              member.email ?? "no email"
            }>`
            : `removed unknown user ${memberId}`,
          householdId: id,
        });
      }
    } else if (method === "PROMOTE_MEMBER" && myRole === "owner") {
      const memberId = String(form.get("member_user_id"));
      const promoted = await ctx.state.db.query<{ user_id: string }>(
        `UPDATE household_members SET role = 'owner'
         WHERE household_id = $1 AND user_id = $2 AND role = 'member'
         RETURNING user_id`,
        [id, memberId],
      );
      if (promoted.rows.length > 0) {
        const memberRes = await ctx.state.db.query<{
          name: string | null;
          email: string | null;
        }>("SELECT name, email FROM users WHERE id = $1", [memberId]);
        const member = memberRes.rows[0];
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "household.promote_member",
          targetType: "household",
          targetId: id,
          targetLabel: householdName,
          detail: member
            ? `made ${member.name ?? "(no name)"} <${
              member.email ?? "no email"
            }> an owner`
            : undefined,
          householdId: id,
        });
      }
    } else if (method === "LEAVE") {
      // An owner may leave only once someone else owns the household, so it
      // is never left without anyone who can manage members and settings.
      let canLeave = myRole !== "owner";
      if (!canLeave) {
        const others = await ctx.state.db.query(
          `SELECT 1 FROM household_members
           WHERE household_id = $1 AND role = 'owner' AND user_id != $2`,
          [id, ctx.state.user.id],
        );
        canLeave = others.rows.length > 0;
      }
      if (!canLeave) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/household?error=" + encodeURIComponent(
              "Make another member an owner before leaving, or delete the household.",
            ),
          },
        });
      }
      await ctx.state.db.query(
        "DELETE FROM household_members WHERE household_id = $1 AND user_id = $2",
        [id, ctx.state.user.id],
      );
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.leave",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: id,
      });
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    } else if (method === "UPDATE_NAME" && myRole === "owner") {
      const name = form.get("name") as string;
      if (name?.trim()) {
        await ctx.state.db.query(
          "UPDATE households SET name = $1, updated_at = now() WHERE id = $2",
          [name.trim(), id],
        );
        await logAudit(ctx.state.db.query, ctx.state.user, {
          action: "household.rename",
          targetType: "household",
          targetId: id,
          targetLabel: name.trim(),
          detail: `renamed from ${householdName}`,
          householdId: id,
        });
      }
    } else if (method === "DELETE" && myRole === "owner") {
      await ctx.state.db.query("DELETE FROM households WHERE id = $1", [id]);
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "household.delete",
        targetType: "household",
        targetId: id,
        targetLabel: householdName,
        householdId: null,
      });
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

export default page(function HouseholdDetailPage(
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
      kitchen,
      error,
    },
    state,
    url,
  },
) {
  const isOwner = myRole === "owner";
  const otherOwners = members.some((m) =>
    m.role === "owner" && m.user_id !== state.user!.id
  );

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">{household.name}</h1>
        <div class="flex gap-2">
          <ButtonLink href="/plan">Plan</ButtonLink>
          <ButtonLink href="/household/pantry">Pantry</ButtonLink>
        </div>
      </div>

      {error && <div class="alert-error mb-4">{error}</div>}

      <div class="card mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <a href="/household/pantry" class="link">
          {kitchen.pantry_count} in the pantry
        </a>
        {kitchen.expiring_count > 0 && (
          <a
            href="/plan"
            class="text-amber-600 dark:text-amber-400 hover:underline"
          >
            {kitchen.expiring_count} going off soon
          </a>
        )}
        <a href="/plan" class="link">
          {kitchen.planned_count} meal{kitchen.planned_count === 1 ? "" : "s"}
          {" "}
          planned
        </a>
        <span class="text-stone-500">
          {kitchen.cooked_this_month} cooked in the last 30 days
        </span>
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
              <ButtonLink href="/recipes/new" class="shrink-0">
                New Recipe
              </ButtonLink>
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
                          <IconUsers class="size-3.5 inline mr-0.5" />
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
                            <IconClock class="size-3.5 inline mr-0.5" />Prep:
                            {" "}
                            {formatDuration(r.prep_time)}
                          </span>
                        )}
                        {r.cook_time != null && (
                          <span>
                            <IconFlame class="size-3.5 inline mr-0.5" />Cook:
                            {" "}
                            {formatDuration(r.cook_time)}
                          </span>
                        )}
                        {r.rest_time != null && (
                          <span>
                            <IconZzz class="size-3.5 inline mr-0.5" />Rest:{" "}
                            {formatDuration(r.rest_time)}
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
                          <Button
                            type="submit"
                            variant="danger-ghost"
                            icon={IconTrash}
                            title="Remove"
                          />
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
                <Select name="tool_id" class="flex-1" size="sm">
                  <option value="">Add a tool...</option>
                  {availableTools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit">
                  Add
                </Button>
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
                          <Button
                            type="submit"
                            variant="danger-ghost"
                            icon={IconTrash}
                            title="Remove"
                          />
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
                <Select name="store_id" class="flex-1" size="sm">
                  <option value="">Add a store...</option>
                  {availableStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit">
                  Add
                </Button>
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
                    {isOwner && m.user_id !== state.user!.id &&
                      m.role === "member" && (
                      <form method="POST" class="inline shrink-0">
                        <input
                          type="hidden"
                          name="_method"
                          value="PROMOTE_MEMBER"
                        />
                        <input
                          type="hidden"
                          name="member_user_id"
                          value={m.user_id}
                        />
                        <ConfirmButton
                          message={`Make ${m.name} an owner? Owners manage members, invites, and settings, and this frees you to leave the household.`}
                          variant="ghost"
                          size="xs"
                        >
                          Make owner
                        </ConfirmButton>
                      </form>
                    )}
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
                        <Button
                          type="submit"
                          variant="danger-ghost"
                          icon={IconTrash}
                          title="Remove member"
                        />
                      </form>
                    )}
                  </div>
                ))}
              </div>
              {(!isOwner || otherOwners) && (
                <form method="POST" class="mt-4">
                  <input type="hidden" name="_method" value="LEAVE" />
                  <ConfirmButton
                    message="Leave this household? You'll lose access to its recipes, pantry, and lists, and will need an invite or a new household to keep using Foodex."
                    variant="danger-outline"
                    class="w-full"
                  >
                    Leave Household
                  </ConfirmButton>
                </form>
              )}
              {isOwner && !otherOwners && members.length > 1 && (
                <p class="text-xs text-stone-400 mt-4">
                  Moving out? Make another member an owner first, then you can
                  leave.
                </p>
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
                            {
                              /*
                              min-w-0: a flex item's default min-width is its
                              content, so this read-only input refused to
                              shrink and pushed the Share button and the
                              revoke icon out past the row's border.
                            */
                            }
                            <Input
                              type="text"
                              readOnly
                              value={inviteUrl}
                              class="flex-1 min-w-0 bg-transparent border-none p-0 h-auto"
                              size="xs"
                            />
                            <div class="shrink-0">
                              <ShareButton url={inviteUrl} />
                            </div>
                            <form method="POST" class="inline shrink-0">
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
                              <Button
                                type="submit"
                                variant="danger-ghost"
                                icon={IconTrash}
                                title="Revoke"
                              />
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
                    <Button type="submit" class="w-full">
                      Generate Invite Link
                    </Button>
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
                    <Input
                      type="text"
                      name="name"
                      value={household.name}
                      required
                      class="w-full"
                    />
                  </FormField>
                  <Button type="submit">
                    Update
                  </Button>
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
                    variant="danger"
                    class="w-full"
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
