import { handler, page } from "./$magic-link.ts";
import {
  generateSessionId,
  sanitizeRedirect,
  verifyHCaptcha,
} from "../../lib/auth.ts";
import { sendMagicLinkEmail } from "../../lib/email.ts";
import { ButtonLink } from "../../components/Button.tsx";

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

    // Always show confirmation (don't reveal whether email exists)
    ctx.state.pageTitle = "Check Your Email";
    return { data: {} };
  },
});

export default page(function MagicLinkSentPage() {
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-4">Check your email</h1>
      <div class="card">
        <p class="text-stone-600 dark:text-stone-400 mb-4">
          If an account exists for that email, we've sent a sign-in link. It
          expires in 15 minutes.
        </p>
        <ButtonLink href="/auth/login" variant="outline" class="w-full">
          Back to sign in
        </ButtonLink>
      </div>
    </div>
  );
});
