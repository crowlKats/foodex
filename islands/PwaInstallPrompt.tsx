import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { IconX } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { catalogFor } from "../lib/i18n/mod.ts";

const DISMISSED_KEY = "pwa-install-dismissed";

export default function PwaInstallPrompt({ locale }: { locale: string }) {
  const m = catalogFor(locale);
  const show = useSignal(false);

  useEffect(() => {
    const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
    const isStandalone = ("standalone" in navigator &&
      (navigator as unknown as { standalone: boolean }).standalone) ||
      matchMedia("(display-mode: standalone)").matches;
    const dismissed = localStorage.getItem(DISMISSED_KEY);

    if (isIos && !isStandalone && !dismissed) {
      show.value = true;
    }
  }, []);

  function dismiss() {
    show.value = false;
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  return (
    <div
      class={`sm:hidden fixed bottom-16 left-3 right-3 z-[60] card border-orange-600 dark:border-orange-500 animate-slide-up ${
        show.value ? "" : "hidden"
      }`}
    >
      <Button
        type="button"
        variant="ghost"
        icon={IconX}
        title={m.common.dismiss()}
        class="absolute top-2 right-2"
        onClick={dismiss}
      />
      <p class="font-bold mb-1">{m.pwa.install()}</p>
      <p class="text-sm text-stone-600 dark:text-stone-400">
        {m.pwa.installBody()}
      </p>
    </div>
  );
}
