import { handler, page } from "./$magic-link.ts";
import {
  generateSessionId,
  sanitizeRedirect,
  verifyHCaptcha,
} from "../../lib/auth.ts";
import { sendMagicLinkEmail } from "../../lib/email.ts";
import { ButtonLink } from "../../components/Button.tsx";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./magic-link.en.mfr";
import it from "./magic-link.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const email = form.get("email");
    const rawRedirect = form.get("redirect");
    const redirectTo = sanitizeRedirect(
      typeof rawRedirect === "string" ? rawRedirect : null,
    );
    // Send the user back to a login page that still knows where they were
    // headed, so a typo'd address or a failed captcha doesn't lose the invite.
    const loginUrl = (error?: string) => {
      const params = new URLSearchParams();
      if (error) params.set("error", error);
      if (redirectTo) params.set("redirect", redirectTo);
      const query = params.toString();
      return query ? `/auth/login?${query}` : "/auth/login";
    };

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl() },
      });
    }

    const captchaToken = form.get("h-captcha-response");
    const remoteIp = ctx.req.headers.get("x-forwarded-for")?.split(",")[0]
      .trim();
    const captchaOk = await verifyHCaptcha(
      typeof captchaToken === "string" ? captchaToken : null,
      remoteIp,
    );
    if (!captchaOk) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl("captcha") },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Opportunistic cleanup (~1% of requests)
    if (Math.random() < 0.01) {
      ctx.state.db.query(
        "DELETE FROM magic_link_tokens WHERE expires_at < now()",
      ).catch(() => {});
    }

    const token = generateSessionId();
    await ctx.state.db.query(
      `INSERT INTO magic_link_tokens (id, email, expires_at, redirect_to)
       VALUES ($1, $2, now() + interval '15 minutes', $3)`,
      [token, normalizedEmail, redirectTo],
    );

    const baseUrl = `${ctx.url.protocol}//${ctx.url.host}`;
    const magicLinkUrl = `${baseUrl}/auth/callback/email?token=${token}`;

    try {
      await sendMagicLinkEmail(normalizedEmail, magicLinkUrl);
    } catch (err) {
      console.error("Failed to send magic link email:", err);
    }

    // The confirmation is unconditional: the link is sent to any address,
    // and following it signs in or creates the account. Send failures are
    // logged but not surfaced; the page would leak nothing useful anyway.
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "auth.checkEmailTitle",
    ).format();
    return { data: {} };
  },
});

export default page(function MagicLinkSentPage() {
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-4">
        {t("auth.checkEmailHeading")}
      </h1>
      <div class="card">
        <p class="text-stone-600 dark:text-stone-400 mb-4">
          {t("auth.checkEmailBody")}
        </p>
        <ButtonLink href="/auth/login" variant="outline" class="w-full">
          {shared("auth.backToSignIn")}
        </ButtonLink>
      </div>
    </div>
  );
});
