import { effect, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { Button, ButtonLink } from "../components/Button.tsx";
import { menuPinnedByTour, openMenu } from "../lib/menu-state.ts";
import { catalogFor } from "../lib/i18n/mod.ts";

interface Step {
  /**
   * data-tour anchors in priority order; the first with a visible element
   * gets the ring. A "menu" entry marks a target that may live inside a
   * top-bar dropdown (the hamburger on phones, More on desktop): the tour
   * opens the menu and rings the item inside it, ringing the menu button
   * itself only if the item never shows up.
   */
  targets: string[];
  title: string;
  body: string;
  /** Shown when the step anchored inside a dropdown menu (or nowhere). */
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
  /** True when anchored inside a dropdown menu (or to its button). */
  menu: boolean;
}

const CARD_WIDTH = 368; // capped to the viewport on narrow screens

function anchorFor(el: Element, menu: boolean): Anchor | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    below: r.top + r.height / 2 > innerHeight / 2,
    menu,
  };
}

function findAnchor(names: string[]): Anchor | null {
  for (const name of names) {
    for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
      const a = anchorFor(el, el.closest("[data-tour-panel]") != null);
      if (a) return a;
    }
  }
  return null;
}

/**
 * The visible dropdown button that holds tour items (the hamburger below lg,
 * More above it), if any. Menus advertise themselves with data-tour-menu.
 */
function findMenu(): { id: string; anchor: Anchor } | null {
  for (const el of document.querySelectorAll("[data-tour-menu]")) {
    const a = anchorFor(el, true);
    if (a) return { id: el.getAttribute("data-tour-menu")!, anchor: a };
  }
  return null;
}

function tourSteps(locale: string): Step[] {
  const m = catalogFor(locale);
  return [
    {
      targets: ["recipes"],
      title: m.welcome.tourRecipesTitle(),
      body: m.welcome.tourRecipesBody(),
    },
    {
      targets: ["collections", "menu"],
      title: m.welcome.tourCollectionsTitle(),
      body: m.welcome.tourCollectionsBody(),
      fallbackNote: m.welcome.tourCollectionsFallback(),
    },
    {
      targets: ["assistant", "menu"],
      title: m.welcome.tourAssistantTitle(),
      body: m.welcome.tourAssistantBody(),
      fallbackNote: m.welcome.tourAssistantFallback(),
    },
    {
      targets: ["pantry"],
      title: m.welcome.tourPantryTitle(),
      body: m.welcome.tourPantryBody(),
    },
    {
      targets: ["scan"],
      title: m.welcome.tourScanTitle(),
      body: m.welcome.tourScanBody(),
      optional: true,
    },
    {
      targets: ["plan"],
      title: m.welcome.tourPlanTitle(),
      body: m.welcome.tourPlanBody(),
    },
    {
      targets: ["shopping"],
      title: m.welcome.tourShoppingTitle(),
      body: m.welcome.tourShoppingBody(),
    },
    {
      targets: ["catalogs", "menu"],
      title: m.welcome.tourCatalogsTitle(),
      body: m.welcome.tourCatalogsBody(),
      fallbackNote: m.welcome.tourCatalogsFallback(),
    },
    {
      targets: ["docs", "menu"],
      title: m.welcome.tourDocsTitle(),
      body: m.welcome.tourDocsBody(),
      fallbackNote: m.welcome.tourDocsFallback(),
    },
    {
      targets: ["household"],
      title: m.welcome.tourHouseholdTitle(),
      body: m.welcome.tourHouseholdBody(),
    },
  ];
}

/** Walkthrough that rings each nav item in turn, shown once after sign-up. */
export default function WelcomeTour(
  { target, locale }: { target: string; locale: string },
) {
  const m = catalogFor(locale);
  const STEPS = tourSteps(locale);
  const steps = useSignal(STEPS);
  const index = useSignal(0);
  const anchor = useSignal<Anchor | null>(null);
  // Step index whose target turned out not to be in the menu after opening
  // it; blocks re-opening so a missing item can't loop open/close forever.
  const menuMissed = useRef(-1);

  function measure(i: number) {
    const step = steps.value[i];
    const names = step.targets.filter((t) => t !== "menu");
    const found = findAnchor(names);
    if (found) {
      // Anchored in the main nav, so the menu (if we opened it) can go.
      if (!found.menu && openMenu.peek() != null) {
        menuPinnedByTour.value = false;
        openMenu.value = null;
      }
      anchor.value = found;
      return;
    }
    const menu = step.targets.includes("menu") ? findMenu() : null;
    if (menu && openMenu.peek() == null && menuMissed.current !== i) {
      // The target lives in a dropdown: open it, then measure again once the
      // panel has rendered.
      menuPinnedByTour.value = true;
      openMenu.value = menu.id;
      requestAnimationFrame(() => {
        const retry = findAnchor(names);
        if (retry) {
          menuMissed.current = -1;
          anchor.value = retry;
        } else {
          menuMissed.current = i;
          menuPinnedByTour.value = false;
          openMenu.value = null;
          anchor.value = findMenu()?.anchor ?? null;
        }
      });
      return;
    }
    anchor.value = menu?.anchor ?? null;
  }

  function go(i: number) {
    index.value = i;
    measure(i);
  }

  useEffect(() => {
    // Steps whose only anchors are hidden at this screen size (e.g. Scan on
    // desktop) are dropped up front so the dots reflect the real length.
    steps.value = STEPS.filter((s) =>
      !s.optional || findAnchor(s.targets) != null
    );
    measure(index.value);
    const onResize = () => measure(index.value);
    addEventListener("resize", onResize);
    // Re-anchor whenever the menu opens or closes under the current step,
    // e.g. when the user closes it by hand mid-tour.
    const disposeMenuWatch = effect(() => {
      openMenu.value;
      requestAnimationFrame(() => measure(index.peek()));
    });
    return () => {
      removeEventListener("resize", onResize);
      disposeMenuWatch();
      menuPinnedByTour.value = false;
      openMenu.value = null;
    };
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
      // Above the menu panel (z 70) so the card stays readable when it
      // overlaps an open menu.
      zIndex: 80,
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
            zIndex: 80,
          }}
        />
      )}

      <div class={a ? "" : "max-w-lg mx-auto mt-12"} style={cardStyle}>
        {!a && (
          <>
            <h1 class="text-2xl font-bold mb-2">{m.welcome.heading()}</h1>
            <p class="text-stone-600 dark:text-stone-400 mb-6">
              {m.welcome.tourIntro()}
            </p>
          </>
        )}
        <div class="card bg-white dark:bg-stone-900">
          <h2 class="text-lg font-bold mb-2">{step.title}</h2>
          <p class="text-sm text-stone-700 dark:text-stone-300 mb-2">
            {step.body}
          </p>
          {(!a || a.menu) && step.fallbackNote && (
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
                {m.common.skip()}
              </a>
            )}
            {index.value > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => go(index.value - 1)}
              >
                {m.common.back()}
              </Button>
            )}
            {last
              ? (
                <ButtonLink href={target} size="sm" class="whitespace-nowrap">
                  {m.welcome.getStarted()}
                </ButtonLink>
              )
              : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => go(index.value + 1)}
                >
                  {m.common.next()}
                </Button>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
