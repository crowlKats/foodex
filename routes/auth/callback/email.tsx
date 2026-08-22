import { handler, page } from "./$email.ts";
import {
  createSessionCookie,
  generateSessionId,
  sanitizeRedirect,
  signupAllowed,
} from "../../../lib/auth.ts";
import { localeFromRequest, pickBundle } from "../../../lib/i18n/locale.ts";
import { ButtonLink } from "../../../components/Button.tsx";
import { createT } from "../../../components/Translation.tsx";
import { t as shared } from "../../../locales/shared.ts";
import en from "./email.en.mfr";
import it from "./email.it.mfr";

const t = createT({ en, it });

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
      ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
        "auth.invalidLinkTitle",
      ).format();
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
      ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
        "auth.inviteRequiredTitle",
      ).format();
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

  if (inviteRequired) {
    return (
      <div class="max-w-sm mx-auto mt-16">
        <h1 class="text-2xl font-bold text-center mb-4">
          {t("auth.inviteRequiredHeading")}
        </h1>
        <div class="card">
          <p class="text-stone-600 dark:text-stone-400 mb-4">
            {shared("auth.inviteRequired")}
          </p>
          <ButtonLink href="/auth/login" variant="outline" class="w-full">
            {shared("auth.backToSignIn")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-4">
        {t("auth.invalidLinkHeading")}
      </h1>
      <div class="card">
        <p class="text-stone-600 dark:text-stone-400 mb-4">
          {t("auth.invalidLinkBody")}
        </p>
        <ButtonLink href="/auth/login" variant="outline" class="w-full">
          {shared("auth.backToSignIn")}
        </ButtonLink>
      </div>
    </div>
  );
});
