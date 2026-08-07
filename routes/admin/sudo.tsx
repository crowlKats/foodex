import { handler } from "./$sudo.ts";
import { getSessionIdFromRequest } from "../../lib/auth.ts";
import { logAudit } from "../../lib/audit.ts";

/**
 * Turns sudo on or off for the admin's own session. POST-only: there is no
 * page here, just the state flip; the entry button lives on the admin user
 * page and the exit button in the banner every page shows while sudo is on.
 */
export const handlers = handler({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));
    const sessionId = getSessionIdFromRequest(ctx.req);
    if (!sessionId) {
      return new Response(null, { status: 303, headers: { Location: "/" } });
    }

    if (method === "ENTER") {
      const userId = String(form.get("user_id"));
      if (userId === ctx.state.adminUser.id) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/admin/users/${userId}?error=` +
              encodeURIComponent("You're already yourself."),
          },
        });
      }
      const target = await ctx.state.db.query<{
        name: string | null;
        email: string | null;
      }>("SELECT name, email FROM users WHERE id = $1", [userId]);
      if (target.rows.length === 0) {
        return new Response(null, {
          status: 303,
          headers: { Location: "/admin/users" },
        });
      }
      await ctx.state.db.query(
        "UPDATE sessions SET sudo_user_id = $1 WHERE id = $2",
        [userId, sessionId],
      );
      await logAudit(ctx.state.db.query, ctx.state.adminUser, {
        source: "admin",
        action: "user.sudo_enter",
        targetType: "user",
        targetId: userId,
        targetLabel: `${target.rows[0].name ?? "(no name)"} <${
          target.rows[0].email ?? "no email"
        }>`,
      });
      return new Response(null, { status: 303, headers: { Location: "/" } });
    }

    if (method === "EXIT") {
      const current = await ctx.state.db.query<{
        sudo_user_id: string | null;
        name: string | null;
        email: string | null;
      }>(
        `SELECT s.sudo_user_id, u.name, u.email
         FROM sessions s LEFT JOIN users u ON u.id = s.sudo_user_id
         WHERE s.id = $1`,
        [sessionId],
      );
      await ctx.state.db.query(
        "UPDATE sessions SET sudo_user_id = NULL WHERE id = $1",
        [sessionId],
      );
      const row = current.rows[0];
      if (row?.sudo_user_id) {
        await logAudit(ctx.state.db.query, ctx.state.adminUser, {
          source: "admin",
          action: "user.sudo_exit",
          targetType: "user",
          targetId: row.sudo_user_id,
          targetLabel: `${row.name ?? "(no name)"} <${
            row.email ?? "no email"
          }>`,
        });
        return new Response(null, {
          status: 303,
          headers: { Location: `/admin/users/${row.sudo_user_id}` },
        });
      }
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/users" },
    });
  },
});
