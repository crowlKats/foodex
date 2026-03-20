import { define } from "../../../utils.ts";
import {
  createSessionCookie,
  exchangeGoogleCode,
  generateSessionId,
} from "../../../lib/auth.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const code = ctx.url.searchParams.get("code");
    if (!code) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const { googleId, email, name, avatarUrl } = await exchangeGoogleCode(
      ctx.req,
      code,
    );

    const result = await ctx.state.db.query(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         name = COALESCE(EXCLUDED.name, users.name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
       RETURNING id`,
      [googleId, email, name, avatarUrl],
    );
    const userId = result.rows[0].id as number;

    const sessionId = generateSessionId();
    await ctx.state.db.query(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES ($1, $2, now() + interval '30 days')`,
      [sessionId, userId],
    );

    return new Response(null, {
      status: 303,
      headers: {
        Location: "/recipes",
        "Set-Cookie": createSessionCookie(sessionId),
      },
    });
  },
});
