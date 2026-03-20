import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { query } from "./db/mod.ts";
import { getSessionIdFromRequest } from "./lib/auth.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware(async (ctx) => {
  ctx.state.db = { query };
  ctx.state.user = null;
  ctx.state.shoppingListCount = 0;
  ctx.state.pantryUrl = null;
  ctx.state.householdId = null;

  const sessionId = getSessionIdFromRequest(ctx.req);
  if (sessionId) {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.avatar_url
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.expires_at > now()`,
      [sessionId],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      ctx.state.user = {
        id: row.id as number,
        name: row.name as string,
        email: row.email as string | null,
        avatar_url: row.avatar_url as string | null,
      };

      const countRes = await query(
        `SELECT COUNT(*) as cnt FROM shopping_list_items sli
         JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
         WHERE sl.user_id = $1 AND sli.checked = false`,
        [row.id],
      );
      ctx.state.shoppingListCount = Number(countRes.rows[0].cnt);

      const householdRes = await query(
        `SELECT h.id FROM households h
         JOIN household_members hm ON hm.household_id = h.id
         WHERE hm.user_id = $1`,
        [row.id],
      );
      if (householdRes.rows.length > 0) {
        const hid = householdRes.rows[0].id as number;
        ctx.state.householdId = hid;
        ctx.state.pantryUrl = `/households/${hid}/pantry`;
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

app.fsRoutes();
