const POSTMARK_SERVER_TOKEN = Deno.env.get("POSTMARK_SERVER_TOKEN") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "foodex@kettmeir.dev";

export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string,
): Promise<void> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: FROM_EMAIL,
      To: to,
      Subject: "Sign in to Foodex",
      TextBody:
        `Sign in to Foodex by clicking the link below:\n\n${magicLinkUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
      HtmlBody:
        `<p>Sign in to Foodex by clicking the link below:</p><p><a href="${magicLinkUrl}">Sign in to Foodex</a></p><p>This link expires in 15 minutes.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark error (${res.status}): ${body}`);
  }
}
