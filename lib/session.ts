/**
 * Who's asking, and the handful of per-request facts every page needs.
 *
 * Lives outside `routes/_middleware.tsx` because the error page is dispatched
 * with a fresh context and doesn't inherit the middleware's state; without
 * this it would render a signed-out nav to a signed-in user on every 404.
 */
import { query } from "../db/mod.ts";
import { getSessionIdFromRequest } from "./auth.ts";
import { countOutstandingLines } from "./shopping-list.ts";
import type { User } from "../utils.ts";
import type { UnitSystem } from "./unit-display.ts";

export interface SessionState {
  user: User | null;
  unitSystem: UnitSystem;
  shoppingListCount: number;
  householdId: string | null;
}

export function emptySession(): SessionState {
  return {
    user: null,
    unitSystem: "metric",
    shoppingListCount: 0,
    householdId: null,
  };
}

export async function loadSessionState(req: Request): Promise<SessionState> {
  const state = emptySession();
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return state;

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
  if (result.rows.length === 0) return state;

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
  // The list is a projection now, so the badge is derived rather than a row
  // count. Kept to one query; this runs on every request.
  if (row.household_id) {
    state.shoppingListCount = await countOutstandingLines(
      { query },
      row.household_id,
    );
  }
  return state;
}
