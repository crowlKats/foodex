import { page } from "fresh";
import { define } from "../../utils.ts";
import { generateSessionId } from "../../lib/auth.ts";
import { sendMagicLinkEmail } from "../../lib/email.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const email = form.get("email");

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
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
      `INSERT INTO magic_link_tokens (id, email, expires_at)
       VALUES ($1, $2, now() + interval '15 minutes')`,
      [token, normalizedEmail],
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
    return page();
  },
});

export default define.page(function MagicLinkSentPage() {
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-4">Check your email</h1>
      <div class="card">
        <p class="text-stone-600 dark:text-stone-400 mb-4">
          If an account exists for that email, we've sent a sign-in link. It
          expires in 15 minutes.
        </p>
        <a href="/auth/login" class="btn w-full text-center">
          Back to sign in
        </a>
      </div>
    </div>
  );
});
