import { handler } from "./$index.ts";
import {
  appendEvent,
  createSession,
  listSessions,
} from "../../../lib/agent/session.ts";
import { resolveAttachedImages } from "../../../lib/agent/attachments.ts";

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

  // Creates a session, optionally seeded with a first user message (the
  // chatless import entry point). The caller then opens /agent/<id>?start=1,
  // which runs the turn over the pending message.
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return json({ error: "Not authenticated" }, 401);
    }
    const body = await ctx.req.json().catch(() => ({})) as {
      message?: { text?: string; images?: string[] };
    };

    const text = String(body.message?.text ?? "").trim();
    const imageIds = Array.isArray(body.message?.images)
      ? body.message.images.map(String).filter(Boolean)
      : [];
    const resolved = await resolveAttachedImages(
      ctx.state.db.query,
      ctx.state.householdId,
      imageIds,
    );
    if ("error" in resolved) return json({ error: resolved.error }, 400);

    const session = await createSession(
      ctx.state.db.query,
      ctx.state.user.id,
      ctx.state.householdId,
      text ? text.slice(0, 60) : undefined,
    );
    if (text || resolved.images.length > 0) {
      await appendEvent(ctx.state.db.query, session.id, {
        type: "user_message",
        payload: resolved.images.length > 0
          ? { text, images: resolved.images }
          : { text },
      });
    }
    return json({ id: session.id });
  },
});
