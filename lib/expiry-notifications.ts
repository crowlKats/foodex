import type { QueryFn } from "../db/mod.ts";
import { sendPushNotification } from "./web-push.ts";

const WARN_DAYS = 3;

export async function sendExpiryNotifications(queryFn: QueryFn) {
  // Find subscriptions where it's currently 9 AM in the user's timezone
  const subsRes = await queryFn<{
    sub_id: number;
    household_id: number;
    endpoint: string;
    key_p256dh: string;
    key_auth: string;
  }>(
    `SELECT ps.id AS sub_id, ps.household_id, ps.endpoint, ps.key_p256dh, ps.key_auth
     FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     WHERE EXTRACT(HOUR FROM now() AT TIME ZONE u.timezone) = 9`,
  );

  if (subsRes.rows.length === 0) return;

  const householdIds = [...new Set(subsRes.rows.map((r) => r.household_id))];

  // Find households with expiring items
  const expiringRes = await queryFn<{
    household_id: number;
    expiring_count: number;
    expired_count: number;
  }>(
    `SELECT household_id,
       COUNT(*) FILTER (WHERE expires_at::date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1) AS expiring_count,
       COUNT(*) FILTER (WHERE expires_at::date < CURRENT_DATE) AS expired_count
     FROM pantry_items
     WHERE expires_at IS NOT NULL
       AND expires_at::date <= CURRENT_DATE + $1
       AND household_id = ANY($2)
     GROUP BY household_id`,
    [WARN_DAYS, householdIds],
  );

  if (expiringRes.rows.length === 0) return;

  const staleEndpointIds: number[] = [];

  for (const sub of subsRes.rows) {
    const household = expiringRes.rows.find((r) =>
      r.household_id === sub.household_id
    );
    if (!household) continue;

    const parts: string[] = [];
    if (household.expired_count > 0) {
      parts.push(
        `${household.expired_count} expired item${
          household.expired_count === 1 ? "" : "s"
        }`,
      );
    }
    if (household.expiring_count > 0) {
      parts.push(
        `${household.expiring_count} item${
          household.expiring_count === 1 ? "" : "s"
        } expiring soon`,
      );
    }
    if (parts.length === 0) continue;

    const ok = await sendPushNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.key_p256dh, auth: sub.key_auth },
      },
      {
        title: "Pantry Expiry Reminder",
        body: `You have ${parts.join(" and ")} in your pantry.`,
        url: "/household/pantry",
      },
    );

    if (!ok) {
      staleEndpointIds.push(sub.sub_id);
    }
  }

  if (staleEndpointIds.length > 0) {
    await queryFn(
      "DELETE FROM push_subscriptions WHERE id = ANY($1)",
      [staleEndpointIds],
    );
  }
}
