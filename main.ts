import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import type { UnitSystem } from "./lib/unit-display.ts";
import { cleanupOrphanedMedia, query, transaction } from "./db/mod.ts";
import { getSessionIdFromRequest } from "./lib/auth.ts";
import { deleteFile } from "./lib/s3.ts";
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

    // Single query: user + household + shopping list count (was 3 sequential queries)
    const result = await query<{
      id: number;
      name: string;
      email: string | null;
      avatar_url: string | null;
      unit_system: string | null;
      household_id: number | null;
      shopping_count: number;
    }>(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.unit_system,
              h.id as household_id,
              COALESCE(
                (SELECT COUNT(*)::int FROM shopping_list_items sli
                 JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
                 WHERE sl.household_id = h.id AND sli.checked = false),
                0
              ) as shopping_count
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN household_members hm ON hm.user_id = u.id
       LEFT JOIN households h ON h.id = hm.household_id
       WHERE s.id = $1 AND s.expires_at > now()
       LIMIT 1`,
      [sessionId],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const unitSystem = (row.unit_system ?? "metric") as UnitSystem;
      ctx.state.user = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        unit_system: unitSystem,
      };
      ctx.state.unitSystem = unitSystem;
      ctx.state.householdId = row.household_id;
      ctx.state.shoppingListCount = row.shopping_count;
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

// deno-lint-ignore no-explicit-any
if (typeof (Deno as any).cron === "function") {
  // deno-lint-ignore no-explicit-any
  (Deno as any).cron("pantry-expiry-notifications", "0 * * * *", () => {
    sendExpiryNotifications(query).catch((err) =>
      console.error("Expiry notification cron failed:", err)
    );
  });
}

app.fsRoutes();
