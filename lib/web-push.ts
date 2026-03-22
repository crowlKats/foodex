import webpush from "web-push";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@foodex.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: { title: string; body: string; url?: string },
): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription expired or unsubscribed — caller should delete it
      return false;
    }
    console.error("Push notification failed:", err);
    return false;
  }
}
