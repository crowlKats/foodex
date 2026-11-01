/**
 * The Content-Security-Policy for HTML pages. entry.server.ts applies it to
 * every page that didn't set its own; a page that needs more (the OAuth
 * consent page, whose form ends in a redirect to the client) builds it here
 * with extra sources so it stays the same policy otherwise.
 */
export function contentSecurityPolicy(
  { formAction = [] }: { formAction?: string[] } = {},
): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
    "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com",
    "connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
    "font-src 'self'",
    "frame-src https://hcaptcha.com https://*.hcaptcha.com",
    "object-src 'none'",
    "base-uri 'self'",
    ["form-action 'self'", ...formAction].join(" "),
    "frame-ancestors 'none'",
  ].join("; ");
}
