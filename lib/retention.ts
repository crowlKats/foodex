/**
 * Retention: automated deletions that keep the platform free of abandoned
 * data. Runs opportunistically from the request middleware alongside the
 * session and media cleanup; there is no separate scheduler.
 */
import { query } from "../db/mod.ts";
import { adminEmails } from "./admin.ts";
import { logSystemAudit } from "./audit.ts";
import { deleteFile } from "./s3.ts";

/**
 * Accounts with no household have nothing on the platform: they abandoned
 * onboarding, never accepted their invite, or left a household and didn't
 * land in a new one. A week without a household (tracked by trigger in
 * `users.householdless_since`, NOT account age; someone moving out must get
 * the full grace period) is enough time to come back; after that the account
 * is removed so stale sign-ins don't accumulate. A packed moving box extends
 * the grace to 30 days: it's a declared intent to come back. Admin accounts
 * are exempt.
 */
export async function cleanupStaleAccounts(): Promise<number> {
  const doomed = await query<{
    id: string;
    name: string | null;
    email: string | null;
  }>(
    `SELECT u.id, u.name, u.email FROM users u
     WHERE u.householdless_since IS NOT NULL
       AND u.householdless_since < now() - interval '7 days'
       AND (u.email IS NULL OR lower(u.email) != ALL($1))
       AND NOT EXISTS (
         SELECT 1 FROM moving_box_recipes mb
         WHERE mb.user_id = u.id
           AND mb.created_at > now() - interval '30 days'
       )`,
    [[...adminEmails]],
  );
  if (doomed.rows.length === 0) return 0;

  // The box's S3 copies are referenced only by box rows, which cascade with
  // the user; collect their keys first so the objects go too.
  const keys = await query<{ key: string }>(
    `SELECT jsonb_array_elements(media)->>'key' AS key
     FROM moving_box_recipes WHERE user_id = ANY($1)`,
    [doomed.rows.map((u) => u.id)],
  );
  await query("DELETE FROM users WHERE id = ANY($1)", [
    doomed.rows.map((u) => u.id),
  ]);
  await Promise.allSettled(keys.rows.map((k) => deleteFile(k.key)));

  for (const u of doomed.rows) {
    await logSystemAudit(query, {
      action: "user.retention_delete",
      targetType: "user",
      targetId: u.id,
      targetLabel: `${u.name ?? "(no name)"} <${u.email ?? "no email"}>`,
      detail: "a week without a household",
    });
  }
  return doomed.rows.length;
}
