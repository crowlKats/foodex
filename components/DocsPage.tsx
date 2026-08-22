import type { ComponentChildren } from "preact";
import { createT } from "./Translation.tsx";
import en from "./DocsPage.en.mfr";
import it from "./DocsPage.it.mfr";

const t = createT({ en, it });

type DocsKey = Parameters<ReturnType<typeof t.use>>[0];

export interface DocsPageInfo {
  href: string;
  labelKey: DocsKey;
}

/** Sidebar structure and reading order for the docs section. */
export const DOCS_GROUPS: {
  labelKey: DocsKey;
  pages: DocsPageInfo[];
}[] = [
  {
    labelKey: "docs.groupLearn",
    pages: [
      { href: "/docs", labelKey: "docs.gettingStarted" },
      { href: "/docs/recipes", labelKey: "docs.recipes" },
      { href: "/docs/writing-recipes", labelKey: "docs.writingRecipes" },
      { href: "/docs/import", labelKey: "docs.importAssistant" },
    ],
  },
  {
    labelKey: "docs.groupDayToDay",
    pages: [
      { href: "/docs/pantry", labelKey: "docs.pantry" },
      { href: "/docs/plan", labelKey: "docs.plan" },
      { href: "/docs/shopping", labelKey: "docs.shopping" },
    ],
  },
  {
    labelKey: "docs.groupOrganize",
    pages: [
      { href: "/docs/organizing", labelKey: "docs.organizing" },
      { href: "/docs/household", labelKey: "docs.households" },
      { href: "/docs/ingredients", labelKey: "docs.ingredients" },
    ],
  },
  {
    labelKey: "docs.groupReference",
    pages: [
      { href: "/docs/settings", labelKey: "docs.settings" },
      { href: "/docs/templates", labelKey: "docs.templates" },
    ],
  },
];

const FLAT_PAGES = DOCS_GROUPS.flatMap((g) => g.pages);

/* Shared text styles so every docs page reads the same. */
export const docProse = "text-stone-700 dark:text-stone-300";
export const docMuted = "text-sm text-stone-500 dark:text-stone-400";

export function DocSection(
  { id, title, children }: {
    id: string;
    title: string;
    children: ComponentChildren;
  },
) {
  return (
    <section id={id} class="scroll-mt-4">
      <h2 class="text-xl font-bold mb-3 pb-1 border-b-2 border-stone-300 dark:border-stone-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DocSub(
  { title, children }: { title: string; children: ComponentChildren },
) {
  return (
    <>
      <h3 class="text-lg font-bold mb-2">{title}</h3>
      {children}
    </>
  );
}

/** Callout card for advanced or good-to-know material. */
export function DocNote(
  { title, children }: { title: string; children: ComponentChildren },
) {
  return (
    <div class="card mb-4">
      <h4 class="font-bold mb-2">{title}</h4>
      <div class="text-sm text-stone-600 dark:text-stone-400 space-y-2">
        {children}
      </div>
    </div>
  );
}

function NavLinks({ currentPath }: { currentPath: string }) {
  return (
    <nav class="space-y-5">
      {DOCS_GROUPS.map((group) => (
        <div key={group.labelKey}>
          <div class="text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-1.5">
            {t(group.labelKey)}
          </div>
          <ul class="space-y-0.5">
            {group.pages.map((p) => {
              const active = currentPath === p.href;
              return (
                <li key={p.href}>
                  <a
                    href={p.href}
                    class={`block px-2 py-1 text-sm border-l-2 ${
                      active
                        ? "border-orange-600 dark:border-orange-500 text-orange-700 dark:text-orange-400 font-medium bg-orange-50 dark:bg-stone-800"
                        : "border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:border-stone-400"
                    }`}
                  >
                    {t(p.labelKey)}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Shared frame for every /docs page: sidebar navigation, page header,
 * and previous/next footer links following the sidebar's reading order.
 */
export function DocsPage(
  { currentPath, title, intro, children }: {
    currentPath: string;
    title: string;
    intro?: ComponentChildren;
    children: ComponentChildren;
  },
) {
  const trans = t.use();
  const index = FLAT_PAGES.findIndex((p) => p.href === currentPath);
  const prev = index > 0 ? FLAT_PAGES[index - 1] : null;
  const next = index >= 0 && index < FLAT_PAGES.length - 1
    ? FLAT_PAGES[index + 1]
    : null;

  return (
    <div class="flex gap-10 items-start">
      {/* Desktop sidebar */}
      <aside class="hidden md:block w-52 shrink-0 sticky top-6">
        <div class="font-bold mb-4">{t("docs.title")}</div>
        <NavLinks currentPath={currentPath} />
      </aside>

      <div class="flex-1 min-w-0 max-w-3xl">
        {/* Mobile navigation */}
        <details class="md:hidden card mb-6">
          <summary class="font-bold cursor-pointer">{t("docs.title")}</summary>
          <div class="mt-4">
            <NavLinks currentPath={currentPath} />
          </div>
        </details>

        <h1 class="text-2xl font-bold mb-2">{title}</h1>
        {intro && <p class="text-stone-500 dark:text-stone-400 mb-8">{intro}
        </p>}

        <div class="space-y-10">{children}</div>

        {/* Prev / next */}
        {(prev || next) && (
          <div class="flex justify-between gap-4 mt-12 pt-4 border-t-2 border-stone-200 dark:border-stone-700 text-sm">
            {prev
              ? (
                <a href={prev.href} class="link">
                  &larr; {trans(prev.labelKey)}
                </a>
              )
              : <span />}
            {next && (
              <a href={next.href} class="link text-right">
                {trans(next.labelKey)} &rarr;
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
