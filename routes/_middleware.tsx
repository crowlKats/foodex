import { middleware, type ParentState } from "./$_middleware.ts";
import type { User } from "../utils.ts";
import type { UnitSystem } from "../lib/unit-display.ts";
import {
  cleanupOrphanedMedia,
  query,
  QueryFn,
  transaction,
} from "../db/mod.ts";
import {
  getSessionIdFromRequest,
  householdSetupUrl,
  sanitizeRedirect,
} from "../lib/auth.ts";
import { loadSessionState } from "../lib/session.ts";
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
  if (getSessionIdFromRequest(ctx.req) && Math.random() < 0.01) {
    // Opportunistic cleanup (~1% of authenticated requests)
    query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
    cleanupOrphanedMedia(deleteFile).catch(() => {});
  }

  const state = {
    db: { query, transaction },
    ...(await loadSessionState(ctx.req)),
    pageTitle: "Foodex",
  } satisfies State as State;

  // Require household for authenticated users (onboarding).
  if (state.user && !state.householdId) {
    const url = new URL(ctx.req.url);
    const path = url.pathname;
    if (
      !path.startsWith("/auth") &&
      !path.startsWith("/households") &&
      !path.startsWith("/_fresh") &&
      !path.startsWith("/api")
    ) {
      // Carry where they were headed through onboarding. A shared link is
      // usually what brought a new account here in the first place, and it is
      // lost for good if the detour forgets it.
      const target = sanitizeRedirect(path + url.search);
      return new Response(null, {
        status: 303,
        headers: {
          Location: target ? householdSetupUrl(target) : "/households",
        },
      });
    }
  }

  return ctx.next(state);
});
