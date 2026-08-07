import { middleware, type ParentState } from "./$_middleware.ts";
import { HttpError } from "fresh/errors";
import { loginUrl } from "../../lib/auth.ts";
import type { User } from "../../utils.ts";

export interface State extends ParentState {
  /** The signed-in operator; the guard below guarantees it is non-null. */
  adminUser: User;
}

/**
 * Everything under /admin requires an operator account (ADMIN_EMAILS). A
 * signed-in non-admin gets a 404 rather than a 403 so the panel's existence
 * isn't advertised to regular accounts probing URLs.
 */
export default middleware(function (ctx) {
  const user = ctx.state.user;
  if (!user) {
    const url = new URL(ctx.req.url);
    return new Response(null, {
      status: 303,
      headers: { Location: loginUrl(url.pathname + url.search) },
    });
  }
  if (!ctx.state.isAdmin) throw new HttpError(404);
  return ctx.next({ ...ctx.state, adminUser: user });
});
