import { handler } from "./$index.ts";
import {
  deleteSession,
  getSession,
  loadEvents,
} from "../../../../lib/agent/session.ts";
import { foldConversation } from "../../../../lib/agent/conversation.ts";
import {
  foldStaging,
  serializePending,
} from "../../../../lib/agent/staging.ts";
import { isTurnActive } from "../../../../lib/agent/lock.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) return json({ error: "Not authenticated" }, 401);
    const session = await getSession(ctx.state.db.query, ctx.params.id);
    if (!session || session.user_id !== ctx.state.user.id) {
      return json({ error: "Not found" }, 404);
    }
    const events = await loadEvents(
      ctx.state.db.query,
      session.id,
      session.head_seq,
    );
    return json({
      session: { id: session.id, title: session.title },
      timeline: foldConversation(events).timeline,
      staging: serializePending(foldStaging(events)),
      turn_active: isTurnActive(session.id),
    });
  },

  async DELETE(ctx) {
    if (!ctx.state.user) return json({ error: "Not authenticated" }, 401);
    const session = await getSession(ctx.state.db.query, ctx.params.id);
    if (!session || session.user_id !== ctx.state.user.id) {
      return json({ error: "Not found" }, 404);
    }
    await deleteSession(ctx.state.db.query, session.id);
    return json({ ok: true });
  },
});
