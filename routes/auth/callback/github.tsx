import { define } from "../../../utils.ts";
import {
  clearOAuthStateCookie,
  createSessionCookie,
  exchangeGitHubCode,
  generateSessionId,
  getOAuthStateFromRequest,
} from "../../../lib/auth.ts";

export const handler = define.handlers({
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

    const { githubId, email, name, avatarUrl } = await exchangeGitHubCode(
      ctx.req,
      code,
    );

    const result = await ctx.state.db.query(
      `INSERT INTO users (github_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name = COALESCE(EXCLUDED.name, users.name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
       RETURNING id`,
      [githubId, email, name, avatarUrl],
    );
    const userId = result.rows[0].id as number;

    const sessionId = generateSessionId();
    await ctx.state.db.query(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [sessionId, userId],
    );

    const headers = new Headers({
      Location: "/recipes",
    });
    headers.append("Set-Cookie", createSessionCookie(sessionId));
    headers.append("Set-Cookie", clearOAuthStateCookie());
    return new Response(null, { status: 303, headers });
  },
});
