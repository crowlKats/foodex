import { page, HttpError } from "fresh";
import { define } from "../../../utils.ts";
import { FormField } from "../../../components/FormField.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import CopyButton from "../../../islands/CopyButton.tsx";
import TbTrash from "tb-icons/TbTrash";

function generateInviteCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const id = parseInt(ctx.params.id);

    // Check membership
    const memberCheck = await ctx.state.db.query(
      "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      throw new HttpError(404);
    }
    const myRole = memberCheck.rows[0].role as string;

    const householdRes = await ctx.state.db.query(
      "SELECT * FROM households WHERE id = $1",
      [id],
    );
    if (householdRes.rows.length === 0) {
      throw new HttpError(404);
    }

    const membersRes = await ctx.state.db.query(
      `SELECT hm.*, u.name, u.email, u.avatar_url
       FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.household_id = $1
       ORDER BY hm.role DESC, u.name`,
      [id],
    );

    const invitesRes = await ctx.state.db.query(
      `SELECT * FROM household_invites
       WHERE household_id = $1 AND expires_at > now()
       ORDER BY created_at DESC`,
      [id],
    );

    return page({
      household: householdRes.rows[0],
      members: membersRes.rows,
      invites: invitesRes.rows,
      myRole,
    });
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const id = parseInt(ctx.params.id);
    const form = await ctx.req.formData();
    const method = form.get("_method");

    // Check membership
    const memberCheck = await ctx.state.db.query(
      "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      throw new HttpError(404);
    }
    const myRole = memberCheck.rows[0].role as string;

    if (method === "CREATE_INVITE" && myRole === "owner") {
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
      headers: { Location: `/households/${id}` },
    });
  },
});

export default define.page<typeof handler>(function HouseholdDetailPage(
  { data, state, url },
) {
  const { household, members, invites, myRole } = data as {
    household: Record<string, unknown>;
    members: Record<string, unknown>[];
    invites: Record<string, unknown>[];
    myRole: string;
  };
  const isOwner = myRole === "owner";

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <a href="/households" class="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">
            &larr; Households
          </a>
          <h1 class="text-2xl font-bold">{String(household.name)}</h1>
        </div>
      </div>

      <div class="mb-6">
        <a
          href={`/households/${household.id}/pantry`}
          class="btn btn-primary"
        >
          Pantry
        </a>
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
                  key={String(m.user_id)}
                  class="card flex items-center gap-3"
                >
                  {m.avatar_url && (
                    <img
                      src={String(m.avatar_url)}
                      alt={String(m.name)}
                      class="size-8 rounded-full"
                    />
                  )}
                  <div class="flex-1">
                    <div class="font-medium">
                      {String(m.name)}
                      {Number(m.user_id) === state.user!.id && (
                        <span class="text-xs text-stone-400 ml-1">(you)</span>
                      )}
                    </div>
                    {m.email && (
                      <div class="text-xs text-stone-500">
                        {String(m.email)}
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
                    {String(m.role)}
                  </span>
                  {isOwner && Number(m.user_id) !== state.user!.id && (
                    <form method="POST" class="inline">
                      <input type="hidden" name="_method" value="REMOVE_MEMBER" />
                      <input
                        type="hidden"
                        name="member_user_id"
                        value={String(m.user_id)}
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
                        key={String(inv.id)}
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
                            value={String(inv.id)}
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
                    value={String(household.name)}
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
