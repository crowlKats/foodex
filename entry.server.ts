import { App } from "fresh";
import { sendExpiryNotifications } from "./lib/expiry-notifications.ts";
import { query } from "./db/mod.ts";

export const app = new App()
  // Security headers
  .use(async (ctx) => {
    const resp = await ctx.next();
    resp.headers.set("X-Content-Type-Options", "nosniff");
    resp.headers.set("X-Frame-Options", "DENY");
    resp.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    );
    resp.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    resp.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );

    const ct = resp.headers.get("Content-Type") ?? "";
    if (ct.includes("text/html")) {
      resp.headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
          "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
          "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
          "connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
          "font-src 'self'",
          "frame-src https://hcaptcha.com https://*.hcaptcha.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      );
    }

    return resp;
  })
  // Request logging
  .use((ctx) => {
    console.log(`${ctx.req.method} ${ctx.req.url}`);
    return ctx.next();
  });

// deno-lint-ignore no-explicit-any
if (typeof (Deno as any)?.cron === "function" && !import.meta.env?.DEV) {
  // deno-lint-ignore no-explicit-any
  (Deno as any).cron("pantry-expiry-notifications", "0 * * * *", () => {
    sendExpiryNotifications(query).catch((err) =>
      console.error("Expiry notification cron failed:", err)
    );
  });
}
