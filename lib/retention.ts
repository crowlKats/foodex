/**
 * Retention: automated deletions that keep the platform free of abandoned
 * data. Runs opportunistically from the request middleware alongside the
 * session and media cleanup; there is no separate scheduler.
 */
import { query } from "../db/mod.ts";
import { adminEmails } from "./admin.ts";
import { logSystemAudit } from "./audit.ts";

/**
 * Accounts with no household have nothing on the platform: they abandoned
 * onboarding, never accepted their invite, or left a household and didn't
 * land in a new one. A week without a household (tracked by trigger in
 * `users.householdless_since`, NOT account age; someone moving out must get
 * the full grace period) is enough time to come back; after that the account
 * is removed so stale sign-ins don't accumulate. Admin accounts are exempt.
 */
export async function cleanupStaleAccounts(): Promise<number> {
  const res = await query<{
    id: string;
    name: string | null;
    email: string | null;
  }>(
    `DELETE FROM users u
     WHERE u.householdless_since IS NOT NULL
       AND u.householdless_since < now() - interval '7 days'
       AND (u.email IS NULL OR lower(u.email) != ALL($1))
     RETURNING u.id, u.name, u.email`,
    [[...adminEmails]],
  );
  for (const u of res.rows) {
    await logSystemAudit(query, {
      action: "user.retention_delete",
      targetType: "user",
      targetId: u.id,
      targetLabel: `${u.name ?? "(no name)"} <${u.email ?? "no email"}>`,
      detail: "a week without a household",
    });
  }
  return res.rows.length;
}
