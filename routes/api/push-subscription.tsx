import { define } from "../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const user = ctx.state.user;
    const householdId = ctx.state.householdId;
    if (!user || !householdId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await ctx.req.json();
    const { endpoint, keys, timezone } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return new Response("Bad request", { status: 400 });
    }

    // Update user timezone if provided
    if (timezone && typeof timezone === "string") {
      await ctx.state.db.query(
        "UPDATE users SET timezone = $1 WHERE id = $2",
        [timezone, user.id],
      );
    }

    await ctx.state.db.query(
      `INSERT INTO push_subscriptions (user_id, household_id, endpoint, key_p256dh, key_auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET
         key_p256dh = EXCLUDED.key_p256dh,
         key_auth = EXCLUDED.key_auth,
         user_id = EXCLUDED.user_id,
         household_id = EXCLUDED.household_id`,
      [user.id, householdId, endpoint, keys.p256dh, keys.auth],
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async DELETE(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await ctx.req.json();
    const { endpoint } = body;
    if (!endpoint) {
      return new Response("Bad request", { status: 400 });
    }

    await ctx.state.db.query(
      "DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
      [endpoint, user.id],
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
});
