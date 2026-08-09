import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Button, ButtonLink } from "../components/Button.tsx";

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

const STEPS: Step[] = [
  {
    targets: ["recipes"],
    title: "Recipes",
    body:
      "The shared cookbook. Browse and cook what every household has added, and add your own: import recipes from photos, web pages, or pasted text instead of typing them.",
  },
  {
    targets: ["collections", "menu"],
    title: "Collections",
    body:
      "Group recipes however you like: a weeknight set, a holiday menu, everything from one book. Collections can be shared with other households by link.",
    fallbackNote: "On a phone, Collections lives in this menu.",
  },
  {
    targets: ["assistant", "menu"],
    title: "Assistant",
    body:
      "A chat that helps with the tedious parts: finding, importing, and reworking recipes. Everything it proposes is staged for your review before it touches anything.",
    fallbackNote: "On a phone, the Assistant lives in this menu.",
  },
  {
    targets: ["pantry"],
    title: "Pantry",
    body:
      'What\'s in your kitchen. The pantry powers the "ready to make" filter, tells recipes what you already have, and warns you before things expire.',
  },
  {
    targets: ["scan"],
    title: "Scan",
    body:
      "The barcode scanner. Point your camera at your groceries as you unpack them and they land in the pantry, with the name and package size filled in for you.",
    optional: true,
  },
  {
    targets: ["plan"],
    title: "Plan",
    body:
      "What you intend to cook. Planning a meal puts its missing ingredients on the shopping list, and cooking it updates the pantry.",
  },
  {
    targets: ["shopping"],
    title: "Shopping List",
    body:
      "Worked out for you: whatever your plan needs that the pantry can't cover. Tick items off as you buy them and they land straight in the pantry.",
  },
  {
    targets: ["catalogs", "menu"],
    title: "Ingredients, Stores & Tools",
    body:
      'Shared reference catalogs. Record what things cost where, and which kitchen tools you own; that\'s what powers cost estimates and the "ready to make" filter.',
    fallbackNote: "On a phone, these catalogs live in this menu.",
  },
  {
    // No standalone anchor: the guide always lives inside a menu, so both
    // entries here are fallbacks and the note below always shows.
    targets: ["docs", "catalogs", "menu"],
    title: "The Guide",
    body:
      "Full documentation for everything you just saw, whenever you need the details.",
    fallbackNote: "The guide lives in this menu, alongside the catalogs.",
  },
  {
    targets: ["household"],
    title: "Your Household",
    body:
      "The people you cook with: members, invites, and settings. Everything you've just seen is shared with them. Next up: create your household or join one with an invite.",
  },
];

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

/** Walkthrough that rings each nav item in turn, shown once after sign-up. */
export default function WelcomeTour({ target }: { target: string }) {
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
            <h1 class="text-2xl font-bold mb-2">Welcome to Foodex</h1>
            <p class="text-stone-600 dark:text-stone-400 mb-6">
              A one-minute tour of what's what.
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
                Skip
              </a>
            )}
            {index.value > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => go(index.value - 1)}
              >
                Back
              </Button>
            )}
            {last
              ? (
                <ButtonLink href={target} size="sm" class="whitespace-nowrap">
                  Get started
                </ButtonLink>
              )
              : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => go(index.value + 1)}
                >
                  Next
                </Button>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
