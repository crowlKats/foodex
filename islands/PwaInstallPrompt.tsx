import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import TbDots from "tb-icons/TbDots";
import TbX from "tb-icons/TbX";

const DISMISSED_KEY = "pwa-install-dismissed";

export default function PwaInstallPrompt() {
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
      <button
        onClick={dismiss}
        type="button"
        class="absolute top-2 right-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
        aria-label="Dismiss"
      >
        <TbX class="size-5" />
      </button>
      <p class="font-bold mb-1">Install Foodex</p>
      <p class="text-sm text-stone-600 dark:text-stone-400">
        Tap <TbDots class="size-4 inline -mt-0.5" /> in your browser, then{" "}
        <span class="font-semibold text-stone-900 dark:text-stone-200">
          Share
        </span>
        {" → "}
        <span class="font-semibold text-stone-900 dark:text-stone-200">
          View More
        </span>
        {" → "}
        <span class="font-semibold text-stone-900 dark:text-stone-200">
          Add to Home Screen
        </span>.
      </p>
    </div>
  );
}
