import { define } from "../../../../utils.ts";
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
import { acquireTurn, releaseTurn } from "../../../../lib/agent/lock.ts";
import { rateLimit } from "../../../../lib/rate-limit.ts";

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
    if (!rateLimit(`agent:${ctx.state.user.id}`, 30, 60_000)) {
      return json({ error: "Too many requests" }, 429);
    }

    const body = await ctx.req.json().catch(() => ({})) as {
      text?: string;
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
        if (!text) {
          releaseTurn(session.id);
          return json({ error: "text is required" }, 400);
        }
        await appendEvent(ctx.state.db.query, session.id, {
          type: "user_message",
          payload: { text },
        });
        if (session.title === "New chat") {
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
        async function maybeRetitle() {
          if (body.mode === "resume" || !session) return;
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
