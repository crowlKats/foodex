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
