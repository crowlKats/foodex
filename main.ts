import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { query } from "./db/mod.ts";
import { getSessionIdFromRequest } from "./lib/auth.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware(async (ctx) => {
  ctx.state.db = { query };
  ctx.state.user = null;

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
    }
  }

  return ctx.next();
}));

app.use(define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);
  return ctx.next();
}));

app.fsRoutes();
