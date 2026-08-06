import { handler } from "./$message.ts";
import {
  appendEvent,
  getSession,
  loadEvents,
  setSessionTitle,
} from "../../../../lib/agent/session.ts";
import {
  generateChatTitle,
  runTurn,
  type TurnEvent,
} from "../../../../lib/agent/loop.ts";
import { resolveAttachedImages } from "../../../../lib/agent/attachments.ts";
import { acquireTurn, releaseTurn } from "../../../../lib/agent/lock.ts";
import { rateLimit } from "../../../../lib/rate-limit.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.user) return json({ error: "Not authenticated" }, 401);
    const session = await getSession(ctx.state.db.query, ctx.params.id);
    if (!session || session.user_id !== ctx.state.user.id) {
      return json({ error: "Not found" }, 404);
    }
    if (!rateLimit(`agent:${ctx.state.user.id}`, 30, 60_000)) {
      return json({ error: "Too many requests" }, 429);
    }

    const body = await ctx.req.json().catch(() => ({})) as {
      text?: string;
      images?: string[];
      mode?: string;
    };

    // One in-flight turn per session.
    if (!acquireTurn(session.id)) {
      return json({ error: "A turn is already in progress" }, 409);
    }

    try {
      if (body.mode === "resume") {
        // A conflict_resolve_request was already appended by the staging route;
        // just run the turn over the existing log.
      } else {
        const text = String(body.text ?? "").trim();
        const imageIds = Array.isArray(body.images)
          ? body.images.map(String).filter(Boolean)
          : [];
        if (!text && imageIds.length === 0) {
          releaseTurn(session.id);
          return json({ error: "text or images is required" }, 400);
        }
        const resolved = await resolveAttachedImages(
          ctx.state.db.query,
          session.household_id,
          imageIds,
        );
        if ("error" in resolved) {
          releaseTurn(session.id);
          return json({ error: resolved.error }, 400);
        }
        const images = resolved.images;
        await appendEvent(ctx.state.db.query, session.id, {
          type: "user_message",
          payload: images.length > 0 ? { text, images } : { text },
        });
        if (session.title === "New chat" && text) {
          await setSessionTitle(
            ctx.state.db.query,
            session.id,
            text.slice(0, 60),
          );
        }
      }
    } catch (e) {
      releaseTurn(session.id);
      return json({ error: (e as Error).message }, 500);
    }

    const db = ctx.state.db;
    const encoder = new TextEncoder();
    let ping: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const send = (
          ev:
            | TurnEvent
            | { type: "done" }
            | { type: "ping" }
            | { type: "title"; title: string },
        ) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(ev)}\n\n`),
            );
          } catch {
            // Controller already closed (client disconnected) — ignore.
          }
        };
        // Heartbeat so the client's watchdog can tell a live-but-quiet turn
        // (long tool call) from a dropped connection.
        ping = setInterval(() => send({ type: "ping" }), 15_000);
        runTurn({ db, session, emit: (ev) => send(ev) })
          .then(() => maybeRetitle())
          .catch((e) => send({ type: "error", message: String(e) }))
          .finally(() => {
            clearInterval(ping);
            releaseTurn(session.id);
            send({ type: "done" });
            controller.close();
          });

        // After the first and second completed user turns, refine the title
        // with a model-computed one. Best-effort — never breaks the stream.
        // Resume turns count too: seeded imports (chatless and bulk) only
        // ever run as resume, and their raw "Import the recipe…" seed text
        // would otherwise stay the title forever — unsearchable.
        async function maybeRetitle() {
          if (!session) return;
          try {
            const evs = await loadEvents(
              db.query,
              session.id,
              session.head_seq,
            );
            const turns = evs.filter((e) => e.type === "user_message").length;
            if (turns > 2) return;
            const title = await generateChatTitle(evs);
            if (title) {
              await setSessionTitle(db.query, session.id, title);
              send({ type: "title", title });
            }
          } catch {
            // Titling is non-essential — ignore any failure.
          }
        }
      },
      cancel() {
        clearInterval(ping);
        releaseTurn(session.id);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  },
});
