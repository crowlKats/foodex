import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Button, ButtonLink } from "../components/Button.tsx";
import { createT } from "../components/Translation.tsx";
import { t as shared } from "../locales/shared.ts";
import en from "./WelcomeTour.en.mfr";
import it from "./WelcomeTour.it.mfr";

const t = createT({ en, it });

interface Step {
  /**
   * data-tour anchors in priority order; the first with a visible element
   * gets the ring. Later entries are fallbacks (e.g. the hamburger menu on
   * phones, where some pages are only reachable through it).
   */
  targets: string[];
  title: string;
  body: string;
  /** Shown when the step anchored to a fallback target (or none). */
  fallbackNote?: string;
  /** Drop the step entirely when no target is visible (e.g. Scan on desktop). */
  optional?: boolean;
}

interface Anchor {
  top: number;
  left: number;
  width: number;
  height: number;
  /** True when the anchor sits in the lower half, so the card goes above. */
  below: boolean;
  /** True when a fallback target (not targets[0]) was the one found. */
  fallback: boolean;
}

const CARD_WIDTH = 368; // capped to the viewport on narrow screens

function findAnchor(step: Step): Anchor | null {
  for (let t = 0; t < step.targets.length; t++) {
    for (
      const el of document.querySelectorAll(`[data-tour="${step.targets[t]}"]`)
    ) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return {
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          below: r.top + r.height / 2 > innerHeight / 2,
          fallback: t > 0,
        };
      }
    }
  }
  return null;
}

function tourSteps(
  trans: (key: string) => string,
): Step[] {
  return [
    {
      targets: ["recipes"],
      title: trans("welcome.tourRecipesTitle"),
      body: trans("welcome.tourRecipesBody"),
    },
    {
      targets: ["collections", "menu"],
      title: trans("welcome.tourCollectionsTitle"),
      body: trans("welcome.tourCollectionsBody"),
      fallbackNote: trans("welcome.tourCollectionsFallback"),
    },
    {
      targets: ["assistant", "menu"],
      title: trans("welcome.tourAssistantTitle"),
      body: trans("welcome.tourAssistantBody"),
      fallbackNote: trans("welcome.tourAssistantFallback"),
    },
    {
      targets: ["pantry"],
      title: trans("welcome.tourPantryTitle"),
      body: trans("welcome.tourPantryBody"),
    },
    {
      targets: ["scan"],
      title: trans("welcome.tourScanTitle"),
      body: trans("welcome.tourScanBody"),
      optional: true,
    },
    {
      targets: ["plan"],
      title: trans("welcome.tourPlanTitle"),
      body: trans("welcome.tourPlanBody"),
    },
    {
      targets: ["shopping"],
      title: trans("welcome.tourShoppingTitle"),
      body: trans("welcome.tourShoppingBody"),
    },
    {
      targets: ["catalogs", "menu"],
      title: trans("welcome.tourCatalogsTitle"),
      body: trans("welcome.tourCatalogsBody"),
      fallbackNote: trans("welcome.tourCatalogsFallback"),
    },
    {
      targets: ["docs", "menu"],
      title: trans("welcome.tourDocsTitle"),
      body: trans("welcome.tourDocsBody"),
      fallbackNote: trans("welcome.tourDocsFallback"),
    },
    {
      targets: ["household"],
      title: trans("welcome.tourHouseholdTitle"),
      body: trans("welcome.tourHouseholdBody"),
    },
  ];
}

/** Walkthrough that rings each nav item in turn, shown once after sign-up. */
export default function WelcomeTour(
  { target }: { target: string },
) {
  const trans = t.use();
  const sharedTrans = shared.use();
  const STEPS = tourSteps(trans);
  const steps = useSignal(STEPS);
  const index = useSignal(0);
  const anchor = useSignal<Anchor | null>(null);

  function measure(i: number) {
    anchor.value = findAnchor(steps.value[i]);
  }

  function go(i: number) {
    index.value = i;
    measure(i);
  }

  useEffect(() => {
    // Steps whose only anchors are hidden at this screen size (e.g. Scan on
    // desktop) are dropped up front so the dots reflect the real length.
    steps.value = STEPS.filter((s) => !s.optional || findAnchor(s) != null);
    measure(index.value);
    const onResize = () => measure(index.value);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  const step = steps.value[index.value];
  const last = index.value === steps.value.length - 1;
  const a = anchor.value;

  const cardWidth = a
    ? Math.min(CARD_WIDTH, document.documentElement.clientWidth - 16)
    : CARD_WIDTH;
  const cardStyle = a
    ? {
      position: "fixed" as const,
      left: Math.max(
        8,
        Math.min(a.left, document.documentElement.clientWidth - cardWidth - 8),
      ),
      width: cardWidth,
      ...(a.below
        ? { bottom: innerHeight - a.top + 10 }
        : { top: a.top + a.height + 10 }),
      zIndex: 60,
    }
    : undefined;

  return (
    <>
      {/* Ring around the current nav item */}
      {a && (
        <div
          class="fixed border-2 border-orange-500 animate-pulse pointer-events-none"
          style={{
            top: a.top - 5,
            left: a.left - 5,
            width: a.width + 10,
            height: a.height + 10,
            zIndex: 60,
          }}
        />
      )}

      <div class={a ? "" : "max-w-lg mx-auto mt-12"} style={cardStyle}>
        {!a && (
          <>
            <h1 class="text-2xl font-bold mb-2">{t("welcome.heading")}</h1>
            <p class="text-stone-600 dark:text-stone-400 mb-6">
              {t("welcome.tourIntro")}
            </p>
          </>
        )}
        <div class="card bg-white dark:bg-stone-900">
          <h2 class="text-lg font-bold mb-2">{step.title}</h2>
          <p class="text-sm text-stone-700 dark:text-stone-300 mb-2">
            {step.body}
          </p>
          {(!a || a.fallback) && step.fallbackNote && (
            <p class="text-sm text-stone-500 dark:text-stone-400 mb-2">
              {step.fallbackNote}
            </p>
          )}
          <div class="flex flex-wrap items-center justify-end gap-2 mt-4">
            <div class="flex gap-1 mr-auto" aria-hidden="true">
              {steps.value.map((_, i) => (
                <span
                  key={i}
                  class={`size-1.5 ${
                    i === index.value
                      ? "bg-orange-600 dark:bg-orange-500"
                      : "bg-stone-300 dark:bg-stone-600"
                  }`}
                />
              ))}
            </div>
            {!last && (
              <a
                href={target}
                class="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 mr-1"
              >
                {sharedTrans("common.skip")}
              </a>
            )}
            {index.value > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => go(index.value - 1)}
              >
                {sharedTrans("common.back")}
              </Button>
            )}
            {last
              ? (
                <ButtonLink href={target} size="sm" class="whitespace-nowrap">
                  {t("welcome.getStarted")}
                </ButtonLink>
              )
              : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => go(index.value + 1)}
                >
                  {sharedTrans("common.next")}
                </Button>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
