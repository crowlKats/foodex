import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { IS_BROWSER } from "fresh/runtime";
import TbBell from "tb-icons/TbBell";
import TbBellOff from "tb-icons/TbBellOff";

interface NotificationToggleProps {
  vapidPublicKey: string;
}

export default function NotificationToggle(
  { vapidPublicKey }: NotificationToggleProps,
) {
  const enabled = useSignal(false);
  const loading = useSignal(false);
  const supported = useSignal(false);

  useEffect(() => {
    if (!IS_BROWSER) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    supported.value = true;

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        enabled.value = sub !== null;
      });
    });
  }, []);

  if (!supported.value) return null;

  async function toggle() {
    loading.value = true;
    try {
      const reg = await navigator.serviceWorker.ready;

      if (enabled.value) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push-subscription", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        enabled.value = false;
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          loading.value = false;
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        await fetch("/api/push-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sub.toJSON(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        enabled.value = true;
      }
    } catch (err) {
      console.error("Notification toggle failed:", err);
    } finally {
      loading.value = false;
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading.value}
      class="flex items-center gap-1.5 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-50"
      title={enabled.value
        ? "Disable expiry notifications"
        : "Enable expiry notifications"}
    >
      {enabled.value ? <TbBell class="size-5" /> : <TbBellOff class="size-5" />}
      <span class="hidden sm:inline">
        {enabled.value ? "Notifications on" : "Notify me"}
      </span>
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(
    /_/g,
    "/",
  );
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
