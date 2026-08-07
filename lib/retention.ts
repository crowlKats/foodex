/**
 * Retention: automated deletions that keep the platform free of abandoned
 * data. Runs opportunistically from the request middleware alongside the
 * session and media cleanup; there is no separate scheduler.
 */
import { query } from "../db/mod.ts";
import { adminEmails } from "./admin.ts";
import { logSystemAudit } from "./audit.ts";

/**
 * Accounts that never landed in a household have nothing on the platform:
 * they either abandoned onboarding or never accepted their invite. A week is
 * enough time to come back; after that the account is removed so stale
 * sign-ins don't accumulate. Admin accounts are exempt, household or not.
 */
export async function cleanupStaleAccounts(): Promise<number> {
  const res = await query<{
    id: string;
    name: string | null;
    email: string | null;
  }>(
    `DELETE FROM users u
     WHERE u.created_at < now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM household_members hm WHERE hm.user_id = u.id
       )
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
      detail: "no household a week after signing up",
    });
  }
  return res.rows.length;
}
