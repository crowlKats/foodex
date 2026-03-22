import { App, staticFiles } from "fresh";
import { define, type State, type User } from "./utils.ts";
import { cleanupOrphanedMedia, query, transaction } from "./db/mod.ts";
import { getSessionIdFromRequest } from "./lib/auth.ts";
import { deleteFile } from "./lib/s3.ts";
import type { Household } from "./db/types.ts";
import { sendExpiryNotifications } from "./lib/expiry-notifications.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware(async (ctx) => {
  ctx.state.db = { query, transaction };
  ctx.state.user = null;
  ctx.state.unitSystem = "metric";
  ctx.state.shoppingListCount = 0;
  ctx.state.householdId = null;
  ctx.state.pageTitle = "Foodex";

  const sessionId = getSessionIdFromRequest(ctx.req);
  if (sessionId) {
    // Opportunistic cleanup (~1% of requests)
    if (Math.random() < 0.01) {
      query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
      cleanupOrphanedMedia(deleteFile).catch(() => {});
    }

    const result = await query<User>(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.unit_system
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.expires_at > now()`,
      [sessionId],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      ctx.state.user = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        unit_system: row.unit_system ?? "metric",
      };
      ctx.state.unitSystem = ctx.state.user.unit_system;

      const householdRes = await query<Pick<Household, "id">>(
        `SELECT h.id FROM households h
         JOIN household_members hm ON hm.household_id = h.id
         WHERE hm.user_id = $1`,
        [row.id],
      );
      if (householdRes.rows.length > 0) {
        ctx.state.householdId = householdRes.rows[0].id;

        const countRes = await query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM shopping_list_items sli
           JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
           WHERE sl.household_id = $1 AND sli.checked = false`,
          [ctx.state.householdId],
        );
        ctx.state.shoppingListCount = countRes.rows[0].cnt;
      }
    }
  }

  return ctx.next();
}));

app.use(define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);

  // Require household for authenticated users (onboarding)
  if (ctx.state.user && !ctx.state.householdId) {
    const path = new URL(ctx.req.url).pathname;
    if (
      !path.startsWith("/auth") &&
      !path.startsWith("/households") &&
      !path.startsWith("/_fresh") &&
      !path.startsWith("/api")
    ) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/households" },
      });
    }
  }

  return ctx.next();
}));

Deno.cron("pantry-expiry-notifications", "0 * * * *", () => {
  sendExpiryNotifications(query).catch((err) =>
    console.error("Expiry notification cron failed:", err)
  );
});

app.fsRoutes();
