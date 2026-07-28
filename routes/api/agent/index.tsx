import { handler } from "./$index.ts";
import { createSession, listSessions } from "../../../lib/agent/session.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) return json({ error: "Not authenticated" }, 401);
    const sessions = await listSessions(ctx.state.db.query, ctx.state.user.id);
    return json({ sessions });
  },

  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return json({ error: "Not authenticated" }, 401);
    }
    const session = await createSession(
      ctx.state.db.query,
      ctx.state.user.id,
      ctx.state.householdId,
    );
    return json({ id: session.id });
  },
});
