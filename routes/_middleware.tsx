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
  householdRequirementResponse,
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

  // Membership in a household is required for everything beyond signing in
  // and onboarding; see householdRequirementResponse for the exemptions.
  if (state.user && !state.householdId) {
    const denied = householdRequirementResponse(new URL(ctx.req.url));
    if (denied) return denied;
  }

  return ctx.next(state);
});
