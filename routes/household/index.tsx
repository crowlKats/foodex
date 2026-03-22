import { page } from "fresh";
import { define } from "../../utils.ts";
import { FormField } from "../../components/FormField.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import CopyButton from "../../islands/CopyButton.tsx";
import TbTrash from "tb-icons/TbTrash";
import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
  HouseholdRecipe,
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
      ctx.state.db.query<HouseholdRecipe>(
        `SELECT r.id, r.title, r.slug, r.private FROM recipes r
           WHERE r.household_id = $1
           ORDER BY r.updated_at DESC`,
        [id],
      ),
    ]);

    const allTools = toolsRes.rows;
    const tools = allTools.filter((t) => t.owned);
    const availableTools = allTools.filter((t) => !t.owned);

    const allStores = storesRes.rows;
    const stores = allStores.filter((s) => s.owned);
    const availableStores = allStores.filter((s) => !s.owned);

    ctx.state.pageTitle = householdRes.rows[0].name as string;
    return page({
      household: householdRes.rows[0],
      members: membersRes.rows,
      invites: invitesRes.rows,
      tools,
      availableTools,
      stores,
      availableStores,
      recipes: recipesRes.rows,
      myRole,
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
      const toolId = parseInt(form.get("tool_id") as string);
      if (toolId) {
        await ctx.state.db.query(
          "INSERT INTO household_tools (household_id, tool_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, toolId],
        );
      }
    } else if (method === "REMOVE_TOOL") {
      const toolId = parseInt(form.get("tool_id") as string);
      if (toolId) {
        await ctx.state.db.query(
          "DELETE FROM household_tools WHERE household_id = $1 AND tool_id = $2",
          [id, toolId],
        );
      }
    } else if (method === "ADD_STORE") {
      const storeId = parseInt(form.get("store_id") as string);
      if (storeId) {
        await ctx.state.db.query(
          "INSERT INTO household_stores (household_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [id, storeId],
        );
      }
    } else if (method === "REMOVE_STORE") {
      const storeId = parseInt(form.get("store_id") as string);
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
      const inviteId = parseInt(form.get("invite_id") as string);
      await ctx.state.db.query(
        "DELETE FROM household_invites WHERE id = $1 AND household_id = $2",
        [inviteId, id],
      );
    } else if (method === "REMOVE_MEMBER" && myRole === "owner") {
      const memberId = parseInt(form.get("member_user_id") as string);
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
    },
    state,
    url,
  },
) {
  const isOwner = myRole === "owner";

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">{household.name}</h1>
        </div>

        <a href="/household/pantry" class="btn btn-primary">
          Pantry
        </a>
      </div>

      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">
            Our Recipes ({recipes.length})
          </h2>
          <a href="/recipes/new" class="btn btn-primary text-sm">
            New Recipe
          </a>
        </div>
        {recipes.length === 0
          ? (
            <p class="text-stone-500 text-sm">
              No recipes yet.
            </p>
          )
          : (
            <div class="space-y-1">
              {recipes.map((r) => (
                <a
                  key={r.id}
                  href={`/recipes/${r.slug}`}
                  class="block card card-hover py-2 px-3"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm flex-1">{r.title}</span>
                    {r.private && (
                      <span class="text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded">
                        private
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
      </div>

      <div class="grid gap-6 md:grid-cols-2 mb-6">
        <div>
          <h2 class="text-lg font-semibold mb-3">
            Our Tools ({tools.length})
          </h2>
          {tools.length > 0 && (
            <div class="flex flex-wrap gap-2 mb-3">
              {tools.map((t) => (
                <div
                  key={t.id}
                  class="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full bg-stone-100 dark:bg-stone-800"
                >
                  <a href={`/tools/${t.id}`} class="hover:underline">
                    {t.name}
                  </a>
                  <form method="POST" class="inline">
                    <input type="hidden" name="_method" value="REMOVE_TOOL" />
                    <input type="hidden" name="tool_id" value={t.id} />
                    <button
                      type="submit"
                      class="text-stone-400 hover:text-red-500 cursor-pointer ml-1 text-xs leading-none"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
          {tools.length === 0 && (
            <p class="text-stone-500 text-sm mb-3">
              No tools added yet.
            </p>
          )}
          {availableTools.length > 0 && (
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
          )}
        </div>

        <div>
          <h2 class="text-lg font-semibold mb-3">
            Our Stores ({stores.length})
          </h2>
          {stores.length > 0 && (
            <div class="flex flex-wrap gap-2 mb-3">
              {stores.map((s) => (
                <div
                  key={s.id}
                  class="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full bg-stone-100 dark:bg-stone-800"
                >
                  <a href={`/stores/${s.id}`} class="hover:underline">
                    {s.name}
                  </a>
                  <form method="POST" class="inline">
                    <input type="hidden" name="_method" value="REMOVE_STORE" />
                    <input type="hidden" name="store_id" value={s.id} />
                    <button
                      type="submit"
                      class="text-stone-400 hover:text-red-500 cursor-pointer ml-1 text-xs leading-none"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
          {stores.length === 0 && (
            <p class="text-stone-500 text-sm mb-3">
              No stores added yet.
            </p>
          )}
          {availableStores.length > 0 && (
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
          )}
        </div>
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <div class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold mb-3">
              Members ({members.length})
            </h2>
            <div class="space-y-2">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  class="card flex items-center gap-3"
                >
                  {m.avatar_url && (
                    <img
                      src={m.avatar_url}
                      alt={m.name}
                      class="size-8 rounded-full"
                    />
                  )}
                  <div class="flex-1">
                    <div class="font-medium">
                      {m.name}
                      {m.user_id === state.user!.id && (
                        <span class="text-xs text-stone-400 ml-1">(you)</span>
                      )}
                    </div>
                    {m.email && (
                      <div class="text-xs text-stone-500">
                        {m.email}
                      </div>
                    )}
                  </div>
                  <span
                    class={`text-xs px-2 py-0.5 rounded ${
                      m.role === "owner"
                        ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300"
                        : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                    }`}
                  >
                    {m.role}
                  </span>
                  {isOwner && m.user_id !== state.user!.id && (
                    <form method="POST" class="inline">
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
          </div>

          {!isOwner && (
            <form method="POST">
              <input type="hidden" name="_method" value="LEAVE" />
              <button
                type="submit"
                class="btn text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
              >
                Leave Household
              </button>
            </form>
          )}
        </div>

        {isOwner && (
          <div class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold mb-3">Invite Link</h2>
              <p class="text-xs text-stone-500 mb-3">
                Share an invite link so others can join this household. Links
                expire after 7 days.
              </p>

              {invites.length > 0 && (
                <div class="space-y-2 mb-3">
                  {invites.map((inv) => {
                    const inviteUrl =
                      `${url.origin}/households/join/${inv.code}`;
                    return (
                      <div
                        key={inv.id}
                        class="card text-sm flex items-center gap-2"
                      >
                        <input
                          type="text"
                          readOnly
                          value={inviteUrl}
                          class="flex-1 text-xs bg-transparent border-none"
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
                            <TbTrash class="size-4" />
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}

              <form method="POST">
                <input type="hidden" name="_method" value="CREATE_INVITE" />
                <button type="submit" class="btn btn-primary">
                  Generate Invite Link
                </button>
              </form>
            </div>

            <div>
              <h2 class="text-lg font-semibold mb-3">Settings</h2>
              <form method="POST" class="card space-y-3">
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

            <div>
              <h2 class="text-lg font-semibold mb-3 text-red-600">
                Danger Zone
              </h2>
              <form method="POST">
                <input type="hidden" name="_method" value="DELETE" />
                <ConfirmButton
                  message="Delete this household? This cannot be undone."
                  class="btn text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  Delete Household
                </ConfirmButton>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
