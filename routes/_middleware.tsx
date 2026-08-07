import { middleware, type ParentState } from "./$_middleware.ts";
import { HttpError } from "fresh/errors";
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
import { cleanupStaleAccounts } from "../lib/retention.ts";
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
  isAdmin: boolean;
  pageTitle: string;
}

export default middleware(async function (ctx) {
  if (getSessionIdFromRequest(ctx.req) && Math.random() < 0.01) {
    // Opportunistic cleanup (~1% of authenticated requests)
    query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
    cleanupOrphanedMedia(deleteFile).catch(() => {});
    cleanupStaleAccounts().catch(() => {});
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

  try {
    return await ctx.next(state);
  } catch (err) {
    // The framework catches any thrown error and renders _error.tsx without
    // logging it, so a production 500 leaves no trace. HttpErrors are skipped:
    // they are deliberate responses (404s from stale links), not failures.
    if (!(err instanceof HttpError)) {
      console.error(`${ctx.req.method} ${ctx.req.url} failed:`, err);
    }
    throw err;
  }
});
