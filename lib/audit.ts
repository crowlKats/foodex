/**
 * App-wide audit trail for edit operations. One row per durable mutation:
 * who did it, what it hit, and through which surface. Actor and target are
 * stored as text snapshots on purpose; the rows an edit touches are exactly
 * the ones that can be deleted later, and the trail has to stay readable
 * after they're gone.
 */
import type { QueryFn } from "../db/mod.ts";
import type { User } from "../utils.ts";

export interface AuditEntry {
  /** Dotted verb, e.g. "recipe.update", "household.remove_member". */
  action: string;
  /** Entity kind: "recipe", "ingredient", "store", "user", "system", ... */
  targetType: string;
  targetId?: string | null;
  /** Human-readable snapshot of the target; must make sense after the row is gone. */
  targetLabel: string;
  detail?: string;
  /** Household the change happened in, when there is one. */
  householdId?: string | null;
  /** Which surface made the edit. */
  source?: "app" | "agent" | "admin";
}

export async function logAudit(
  query: QueryFn,
  actor: User,
  entry: AuditEntry,
): Promise<void> {
  await query(
    `INSERT INTO audit_log
       (actor_id, actor_label, source, household_id, action,
        target_type, target_id, target_label, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      actor.id,
      `${actor.name} <${actor.email ?? "no email"}>`,
      entry.source ?? "app",
      entry.householdId ?? null,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      entry.targetLabel,
      entry.detail ?? null,
    ],
  );
}
