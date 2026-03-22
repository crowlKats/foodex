import { page } from "fresh";
import { define } from "../../../utils.ts";
import { createSessionCookie, generateSessionId } from "../../../lib/auth.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const token = ctx.url.searchParams.get("token");
    if (!token) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const result = await ctx.state.db.query<
      { id: string; email: string }
    >(
      `UPDATE magic_link_tokens
       SET used = true
       WHERE id = $1 AND expires_at > now() AND used = false
       RETURNING id, email`,
      [token],
    );

    if (result.rows.length === 0) {
      ctx.state.pageTitle = "Invalid Link";
      return page();
    }

    const { email } = result.rows[0];

    const userResult = await ctx.state.db.query<{ id: number }>(
      `INSERT INTO users (email, name)
       VALUES ($1, $1)
       ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
         email = EXCLUDED.email
       RETURNING id`,
      [email],
    );
    const userId = userResult.rows[0].id;

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

export default define.page(function InvalidTokenPage() {
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-4">
        Invalid or expired link
      </h1>
      <div class="card">
        <p class="text-stone-600 dark:text-stone-400 mb-4">
          This sign-in link has expired or has already been used. Please request
          a new one.
        </p>
        <a href="/auth/login" class="btn w-full text-center">
          Back to sign in
        </a>
      </div>
    </div>
  );
});
