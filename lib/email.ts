import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

const POSTMARK_SERVER_TOKEN = Deno.env.get("POSTMARK_SERVER_TOKEN") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "foodex@kettmeir.dev";

const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Deno.env.get("SMTP_PORT");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const SMTP_SECURE = Deno.env.get("SMTP_SECURE");

let smtpTransporter: Transporter | null = null;
function getSmtpTransporter(): Transporter {
  if (smtpTransporter) return smtpTransporter;
  const port = SMTP_PORT ? Number(SMTP_PORT) : 587;
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE ? SMTP_SECURE === "true" : port === 465,
    auth: SMTP_USER && SMTP_PASS
      ? { user: SMTP_USER, pass: SMTP_PASS }
      : undefined,
  });
  return smtpTransporter;
}

export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string,
): Promise<void> {
  const subject = "Sign in to Foodex";
  const text =
    `Sign in to Foodex by clicking the link below:\n\n${magicLinkUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`;
  const html =
    `<p>Sign in to Foodex by clicking the link below:</p><p><a href="${magicLinkUrl}">Sign in to Foodex</a></p><p>This link expires in 15 minutes.</p><p>If you didn't request this, you can safely ignore this email.</p>`;

  if (SMTP_HOST) {
    await getSmtpTransporter().sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    return;
  }

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: FROM_EMAIL,
      To: to,
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark error (${res.status}): ${body}`);
  }
}
