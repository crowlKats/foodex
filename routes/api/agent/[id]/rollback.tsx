import { define } from "../../../../utils.ts";
import {
  getSession,
  lastApplySeq,
  loadEvents,
  rollbackTo,
} from "../../../../lib/agent/session.ts";
import { isTurnActive } from "../../../../lib/agent/lock.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user) return json({ error: "Not authenticated" }, 401);
    const session = await getSession(ctx.state.db.query, ctx.params.id);
    if (!session || session.user_id !== ctx.state.user.id) {
      return json({ error: "Not found" }, 404);
    }
    if (isTurnActive(session.id)) {
      return json({ error: "A turn is in progress" }, 409);
    }

    const body = await ctx.req.json().catch(() => ({})) as { seq?: number };
    const seq = Number(body.seq);
    if (!Number.isFinite(seq)) return json({ error: "seq required" }, 400);

    // Cannot roll back to or before the most recent apply.
    const applySeq = await lastApplySeq(ctx.state.db.query, session.id);
    if (applySeq != null && seq < applySeq) {
      return json({ error: "Cannot roll back past an applied change" }, 409);
    }

    // The target must be a turn boundary: the event at `seq` is a user_message
    // (or conflict request), i.e. everything after it is one assistant turn.
    const events = await loadEvents(ctx.state.db.query, session.id, null);
    const target = events.find((e) => e.seq === seq);
    if (
      !target ||
      (target.type !== "user_message" &&
        target.type !== "conflict_resolve_request")
    ) {
      // Allow seq = boundary just before a user_message too: accept the seq of
      // the last event to keep before the chosen turn.
      const boundary = events.filter((e) =>
        e.seq <= seq &&
        (e.type === "user_message" || e.type === "conflict_resolve_request")
      );
      if (boundary.length === 0) {
        return json({ error: "seq is not a turn boundary" }, 400);
      }
    }

    await rollbackTo(ctx.state.db.query, session.id, seq);
    return json({ ok: true });
  },
});
