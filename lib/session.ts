/**
 * Who's asking, and the handful of per-request facts every page needs.
 *
 * Lives outside `routes/_middleware.tsx` because the error page is dispatched
 * with a fresh context and doesn't inherit the middleware's state; without
 * this it would render a signed-out nav to a signed-in user on every 404.
 */
import { query } from "../db/mod.ts";
import { isAdminEmail } from "./admin.ts";
import { getSessionIdFromRequest } from "./auth.ts";
import { countOutstandingLines } from "./shopping-list.ts";
import type { User } from "../utils.ts";
import type { UnitSystem } from "./unit-display.ts";
import { DEFAULT_LOCALE, negotiateLocale } from "./i18n/locale.ts";

export interface SessionState {
  user: User | null;
  unitSystem: UnitSystem;
  shoppingListCount: number;
  householdId: string | null;
  isAdmin: boolean;
  /** Resolved UI locale for this request (user setting, else Accept-Language, else en). */
  locale: string;
}

export function emptySession(): SessionState {
  return {
    user: null,
    unitSystem: "metric",
    shoppingListCount: 0,
    householdId: null,
    isAdmin: false,
    locale: DEFAULT_LOCALE,
  };
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  unit_system: string | null;
  language: string | null;
  household_id: string | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar_url: row.avatar_url,
    unit_system: (row.unit_system ?? "metric") as UnitSystem,
    language: row.language ?? DEFAULT_LOCALE,
  };
}

export async function loadSessionState(req: Request): Promise<SessionState> {
  const state = emptySession();
  const accept = req.headers.get("accept-language");
  state.locale = negotiateLocale(null, accept);
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return state;

  // Single query: user + household.
  const result = await query<UserRow & { sudo_user_id: string | null }>(
    `SELECT u.id, u.name, u.email, u.avatar_url, u.unit_system, u.language,
            s.sudo_user_id, h.id as household_id
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
  state.user = toUser(row);
  state.unitSystem = state.user.unit_system;
  state.householdId = row.household_id;
  state.isAdmin = isAdminEmail(row.email);

  // Sudo: swap in the target's identity and household. Only honored while
  // the session's real user is still an admin, so revoking admin access also
  // kills any impersonation that session had going.
  if (state.isAdmin && row.sudo_user_id && row.sudo_user_id !== row.id) {
    const targetRes = await query<UserRow>(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.unit_system, u.language,
              h.id as household_id
       FROM users u
       LEFT JOIN household_members hm ON hm.user_id = u.id
       LEFT JOIN households h ON h.id = hm.household_id
       WHERE u.id = $1
       LIMIT 1`,
      [row.sudo_user_id],
    );
    if (targetRes.rows.length > 0) {
      const target = targetRes.rows[0];
      state.user = { ...toUser(target), sudoBy: state.user };
      state.unitSystem = state.user.unit_system;
      state.householdId = target.household_id;
    }
  }
  state.locale = negotiateLocale(state.user.language, accept);
  // The list is a projection now, so the badge is derived rather than a row
  // count. Kept to one query; this runs on every request.
  if (state.householdId) {
    state.shoppingListCount = await countOutstandingLines(
      { query },
      state.householdId,
    );
  }
  return state;
}
