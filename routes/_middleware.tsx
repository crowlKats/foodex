import { middleware, type ParentState } from "./$_middleware.ts";
import type { User } from "../utils.ts";
import type { UnitSystem } from "../lib/unit-display.ts";
import {
  cleanupOrphanedMedia,
  query,
  QueryFn,
  transaction,
} from "../db/mod.ts";
import { getSessionIdFromRequest } from "../lib/auth.ts";
import { countOutstandingLines } from "../lib/shopping-list.ts";
import { deleteFile } from "../lib/s3.ts";

export interface State extends ParentState {
  db: {
    query: QueryFn;
    transaction: <T>(fn: (query: QueryFn) => Promise<T>) => Promise<T>;
  };
  user: User | null;
  unitSystem: UnitSystem;
  shoppingListCount: number;
  householdId: string | null;
  pageTitle: string;
}

export default middleware(async function (ctx) {
  const state = {
    db: { query, transaction },
    user: null,
    unitSystem: "metric",
    shoppingListCount: 0,
    householdId: null,
    pageTitle: "Foodex",
  } satisfies State as State;

  const sessionId = getSessionIdFromRequest(ctx.req);
  if (sessionId) {
    // Opportunistic cleanup (~1% of requests)
    if (Math.random() < 0.01) {
      query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
      cleanupOrphanedMedia(deleteFile).catch(() => {});
    }

    // Single query: user + household.
    const result = await query<{
      id: string;
      name: string;
      email: string | null;
      avatar_url: string | null;
      unit_system: string | null;
      household_id: string | null;
    }>(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.unit_system,
              h.id as household_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN household_members hm ON hm.user_id = u.id
       LEFT JOIN households h ON h.id = hm.household_id
       WHERE s.id = $1 AND s.expires_at > now()
       LIMIT 1`,
      [sessionId],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const unitSystem = (row.unit_system ?? "metric") as UnitSystem;
      state.user = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatar_url: row.avatar_url,
        unit_system: unitSystem,
      };
      state.unitSystem = unitSystem;
      state.householdId = row.household_id;
      // The list is a projection now, so the badge is derived rather than a
      // row count. Kept to one query — this runs on every request.
      if (row.household_id) {
        state.shoppingListCount = await countOutstandingLines(
          { query },
          row.household_id,
        );
      }
    }
  }

  // Require household for authenticated users (onboarding).
  if (state.user && !state.householdId) {
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

  return ctx.next(state);
});
