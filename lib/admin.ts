/**
 * Admin access is deployment configuration, not application data. The main
 * accounts come from Authentik, so there is no local password or role to key
 * off; a comma-separated ADMIN_EMAILS env var names the operators instead.
 * Matching is by the verified email on the user row, case-insensitively.
 */
const adminEmails = new Set(
  (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0),
);

export function isAdminEmail(email: string | null): boolean {
  return email != null && adminEmails.has(email.toLowerCase());
}
