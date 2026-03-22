import { define } from "../../utils.ts";
import { clearSessionCookie, getSessionIdFromRequest } from "../../lib/auth.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const sessionId = getSessionIdFromRequest(ctx.req);
    if (sessionId) {
      await ctx.state.db.query("DELETE FROM sessions WHERE id = $1", [
        sessionId,
      ]);
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": clearSessionCookie(),
      },
    });
  },
});
