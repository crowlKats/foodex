import { handler } from "./$authentik.ts";
import {
  clearOAuthRedirectCookie,
  clearOAuthStateCookie,
  createSessionCookie,
  exchangeAuthentikCode,
  generateSessionId,
  getOAuthRedirectFromRequest,
  getOAuthStateFromRequest,
  signupAllowed,
} from "../../../lib/auth.ts";
import { localeFromRequest } from "../../../lib/i18n/locale.ts";

export const handlers = handler({
  async GET(ctx) {
    const code = ctx.url.searchParams.get("code");
    const state = ctx.url.searchParams.get("state");
    const storedState = getOAuthStateFromRequest(ctx.req);
    if (!code || !state || !storedState || state !== storedState) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const { authentikId, email, name, avatarUrl } = await exchangeAuthentikCode(
      ctx.req,
      code,
    );

    const existing = await ctx.state.db.query(
      "SELECT 1 FROM users WHERE authentik_id = $1",
      [authentikId],
    );
    if (
      existing.rows.length === 0 &&
      !await signupAllowed(
        ctx.state.db.query,
        getOAuthRedirectFromRequest(ctx.req),
      )
    ) {
      const headers = new Headers({
        Location: "/auth/login?error=invite_required",
      });
      headers.append("Set-Cookie", clearOAuthStateCookie());
      headers.append("Set-Cookie", clearOAuthRedirectCookie());
      return new Response(null, { status: 303, headers });
    }

    const result = await ctx.state.db.query(
      `INSERT INTO users (authentik_id, email, name, avatar_url, language)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (authentik_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name = COALESCE(users.name, EXCLUDED.name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
       RETURNING id`,
      [authentikId, email, name, avatarUrl, localeFromRequest(ctx.req)],
    );
    const userId = result.rows[0].id as string;

    const sessionId = generateSessionId();
    await ctx.state.db.query(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [sessionId, userId],
    );

    const headers = new Headers({
      Location: getOAuthRedirectFromRequest(ctx.req) ?? "/recipes",
    });
    headers.append("Set-Cookie", createSessionCookie(sessionId));
    headers.append("Set-Cookie", clearOAuthStateCookie());
    headers.append("Set-Cookie", clearOAuthRedirectCookie());
    return new Response(null, { status: 303, headers });
  },
});
