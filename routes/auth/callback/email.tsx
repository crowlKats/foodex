import { handler, page } from "./$email.ts";
import {
  createSessionCookie,
  generateSessionId,
  sanitizeRedirect,
  signupAllowed,
} from "../../../lib/auth.ts";
import { localeFromRequest } from "../../../lib/i18n/locale.ts";
import { ButtonLink } from "../../../components/Button.tsx";
import { catalogFor } from "../../../lib/i18n/mod.ts";
import { useMessages } from "../../../lib/i18n/provider.tsx";

export const handlers = handler({
  async GET(ctx) {
    const token = ctx.url.searchParams.get("token");
    if (!token) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const result = await ctx.state.db.query<
      { id: string; email: string; redirect_to: string | null }
    >(
      `UPDATE magic_link_tokens
       SET used = true
       WHERE id = $1 AND expires_at > now() AND used = false
       RETURNING id, email, redirect_to`,
      [token],
    );

    if (result.rows.length === 0) {
      ctx.state.pageTitle = catalogFor(ctx.state.locale).auth
        .invalidLinkTitle();
      return { data: {} };
    }

    const { email, redirect_to } = result.rows[0];

    const existing = await ctx.state.db.query(
      "SELECT 1 FROM users WHERE email = $1",
      [email],
    );
    if (
      existing.rows.length === 0 &&
      !await signupAllowed(ctx.state.db.query, redirect_to)
    ) {
      ctx.state.pageTitle = catalogFor(ctx.state.locale).auth
        .inviteRequiredTitle();
      return { data: { inviteRequired: true } };
    }

    const userResult = await ctx.state.db.query<{ id: string }>(
      `INSERT INTO users (email, name, language)
       VALUES ($1, NULL, $2)
       ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
         email = EXCLUDED.email
       RETURNING id`,
      [email, localeFromRequest(ctx.req)],
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
        Location: sanitizeRedirect(redirect_to) ?? "/recipes",
        "Set-Cookie": createSessionCookie(sessionId),
      },
    });
  },
});

export default page(function InvalidTokenPage({ data }) {
  const { inviteRequired } = data as { inviteRequired?: boolean };
  const m = useMessages();

  if (inviteRequired) {
    return (
      <div class="max-w-sm mx-auto mt-16">
        <h1 class="text-2xl font-bold text-center mb-4">
          {m.auth.inviteRequiredHeading()}
        </h1>
        <div class="card">
          <p class="text-stone-600 dark:text-stone-400 mb-4">
            {m.auth.inviteRequired()}
          </p>
          <ButtonLink href="/auth/login" variant="outline" class="w-full">
            {m.auth.backToSignIn()}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-4">
        {m.auth.invalidLinkHeading()}
      </h1>
      <div class="card">
        <p class="text-stone-600 dark:text-stone-400 mb-4">
          {m.auth.invalidLinkBody()}
        </p>
        <ButtonLink href="/auth/login" variant="outline" class="w-full">
          {m.auth.backToSignIn()}
        </ButtonLink>
      </div>
    </div>
  );
});
