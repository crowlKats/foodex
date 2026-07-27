import { handler } from "./$staging.ts";
import type { HandlerContext } from "fresh/types";
import {
  appendEvent,
  getSession,
  loadEvents,
} from "../../../../lib/agent/session.ts";
import {
  effective,
  foldStaging,
  serializePending,
} from "../../../../lib/agent/staging.ts";
import { applyStaged } from "../../../../lib/agent/apply.ts";
import { isTurnActive } from "../../../../lib/agent/lock.ts";
import {
  diffToOps,
  INGREDIENT_SCHEMA,
  RECIPE_SCHEMA,
} from "../../../../lib/agent/merge.ts";
import type { AgentSession } from "../../../../db/types.ts";
import type { State } from "../../../../utils.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authSession(
  ctx: HandlerContext<{ id: string }, State>,
): Promise<{ session: AgentSession } | { error: Response }> {
  if (!ctx.state.user) {
    return { error: json({ error: "Not authenticated" }, 401) };
  }
  const session = await getSession(ctx.state.db.query, ctx.params.id);
  if (!session || session.user_id !== ctx.state.user.id) {
    return { error: json({ error: "Not found" }, 404) };
  }
  return { session };
}

async function serializeStaging(
  ctx: HandlerContext<{ id: string }, State>,
  s: AgentSession,
) {
  const events = await loadEvents(ctx.state.db.query, s.id, s.head_seq);
  return serializePending(foldStaging(events));
}

export const handlers = handler({
  async GET(ctx) {
    const auth = await authSession(ctx);
    if ("error" in auth) return auth.error;
    return json({ items: await serializeStaging(ctx, auth.session) });
  },

  async POST(ctx) {
    const auth = await authSession(ctx);
    if ("error" in auth) return auth.error;
    const s = auth.session;
    const db = ctx.state.db;

    // The panel is read-only while the agent is mid-turn.
    if (isTurnActive(s.id)) {
      return json(
        { error: "The assistant is working; try again in a moment." },
        409,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const action = body.action;

    switch (action) {
      case "edit": {
        // The client sends the full edited object; the server diffs it against
        // the item's current value into keyed patch ops (so user edits feed the
        // same apply-time 3-way merge the agent's edits do).
        const item_id = String(body.item_id ?? "");
        const data = body.data as Record<string, unknown> | undefined;
        if (!item_id || !data || typeof data !== "object") {
          return json({ error: "item_id and data required" }, 400);
        }
        const events = await loadEvents(db.query, s.id, s.head_seq);
        const item = foldStaging(events).get(item_id);
        if (!item || item.status !== "pending") {
          return json({ error: "No such staged item" }, 404);
        }
        const schema = item.kind === "edit_ingredient" ||
            item.kind === "create_ingredient"
          ? INGREDIENT_SCHEMA
          : RECIPE_SCHEMA;
        const ops = diffToOps(effective(item), data, schema);
        if (ops.length > 0) {
          await appendEvent(db.query, s.id, {
            type: "user_edit",
            payload: { item_id, ops },
          });
        }
        return json({ items: await serializeStaging(ctx, s) });
      }

      case "revert": {
        const item_id = String(body.item_id ?? "");
        if (!item_id) return json({ error: "item_id required" }, 400);
        await appendEvent(db.query, s.id, {
          type: "user_revert",
          payload: { item_id },
        });
        return json({ items: await serializeStaging(ctx, s) });
      }

      case "discard": {
        const item_id = String(body.item_id ?? "");
        if (!item_id) return json({ error: "item_id required" }, 400);
        await appendEvent(db.query, s.id, {
          type: "user_discard",
          payload: { item_id },
        });
        return json({ items: await serializeStaging(ctx, s) });
      }

      case "resolve_conflict": {
        const item_id = String(body.item_id ?? "");
        if (!item_id) return json({ error: "item_id required" }, 400);
        await appendEvent(db.query, s.id, {
          type: "conflict_resolve_request",
          payload: {
            item_id,
            live_version: String(body.live_version ?? ""),
            conflict_paths: Array.isArray(body.conflict_paths)
              ? body.conflict_paths.map(String)
              : [],
          },
        });
        // The turn is kicked off by the message route (M5). Signal the client to start it.
        return json({ ok: true, start_turn: true });
      }

      case "apply": {
        const ids: string[] = Array.isArray(body.item_ids)
          ? body.item_ids.map(String)
          : [];
        if (ids.length === 0) return json({ error: "item_ids required" }, 400);

        const applied: string[] = [];
        const conflicts: {
          item_id: string;
          conflict_paths: string[];
          live_version: string;
        }[] = [];

        for (const itemId of ids) {
          await db.transaction(async (q) => {
            const events = await loadEvents(q, s.id, s.head_seq);
            const map = foldStaging(events);
            const item = map.get(itemId);
            if (!item || item.status !== "pending") return;

            // Resolve a recipe ingredient's link: a real existing id is kept;
            // a reference to a staged ingredient item creates that ingredient
            // now (a dependency) and links to it; anything else is left unlinked.
            const resolvedRefs = new Map<string, string | null>();
            const resolveIngredientId = async (
              ref: string | null,
            ): Promise<string | null> => {
              if (!ref) return null;
              if (resolvedRefs.has(ref)) return resolvedRefs.get(ref)!;
              let out: string | null = null;

              // 1. A real, existing ingredient id.
              if (UUID_RE.test(ref)) {
                const ex = await q<{ id: string }>(
                  "SELECT id FROM ingredients WHERE id = $1",
                  [ref],
                );
                if (ex.rows.length > 0) out = ref;
              }

              // 2. A staged ingredient that was ALREADY applied (e.g. earlier in
              // this same "apply all" — the agent stages ingredients before the
              // recipe): recover the real id it was created with from the log.
              if (out === null) {
                for (const ev of events) {
                  if (
                    ev.type === "apply" && ev.payload.item_id === ref &&
                    ev.payload.result.kind === "ingredient"
                  ) {
                    out = ev.payload.result.ingredient_id ?? null;
                  }
                }
              }

              // 3. A still-pending staged ingredient: create it now (dependency).
              if (out === null) {
                const dep = map.get(ref);
                if (
                  dep && dep.status === "pending" &&
                  (dep.kind === "create_ingredient" ||
                    dep.kind === "edit_ingredient")
                ) {
                  const depOutcome = await applyStaged(q, s.household_id, dep);
                  if (depOutcome.result?.ingredient_id) {
                    await appendEvent(q, s.id, {
                      type: "apply",
                      payload: { item_id: ref, result: depOutcome.result },
                    });
                    if (!applied.includes(ref)) applied.push(ref);
                    out = depOutcome.result.ingredient_id;
                  }
                }
              }

              resolvedRefs.set(ref, out);
              return out;
            };

            const outcome = await applyStaged(q, s.household_id, item, {
              resolveIngredientId,
            });
            if (outcome.result) {
              await appendEvent(q, s.id, {
                type: "apply",
                payload: { item_id: itemId, result: outcome.result },
              });
              if (!applied.includes(itemId)) applied.push(itemId);
            } else if (outcome.conflict) {
              conflicts.push({ item_id: itemId, ...outcome.conflict });
            }
          });
        }

        return json({
          applied,
          conflicts,
          items: await serializeStaging(ctx, s),
        });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  },
});
