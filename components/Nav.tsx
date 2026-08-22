import { ComponentChildren } from "preact";
import DarkModeToggle from "../islands/DarkModeToggle.tsx";
import NavDropdown, { NavDropdownLink } from "../islands/NavDropdown.tsx";
import { IconChefHat } from "@tabler/icons-preact";
import { IconShoppingCart } from "@tabler/icons-preact";
import { IconCalendar } from "@tabler/icons-preact";
import { IconToolsKitchen2 } from "@tabler/icons-preact";
import { IconFridge } from "@tabler/icons-preact";
import { IconHome } from "@tabler/icons-preact";
import { IconScan } from "@tabler/icons-preact";
import type { User } from "../utils.ts";
import { catalogFor } from "../lib/i18n/mod.ts";

function isActive(currentPath: string, href: string): boolean {
  if (href === "/recipes") {
    return currentPath === "/recipes" || currentPath.startsWith("/recipes/");
  }
  if (href === "/collections") {
    return currentPath === "/collections" ||
      currentPath.startsWith("/collections/");
  }
  if (href === "/household") {
    return currentPath === "/household";
  }
  return currentPath.startsWith(href);
}

function NavLink(
  { href, label, currentPath, tour, badge }: {
    href: string;
    label: string;
    currentPath: string;
    /** Anchor id for the welcome walkthrough (data-tour). */
    tour?: string;
    badge?: number;
  },
) {
  return (
    <a
      href={href}
      data-tour={tour}
      class={`nav-link font-medium whitespace-nowrap ${
        badge !== undefined ? "relative" : ""
      } ${isActive(currentPath, href) ? "text-orange-400" : ""}`}
    >
      {label}
      {badge !== undefined && (
        <span
          data-shopping-badge
          class={`count-badge count-badge-accent ml-1.5 ${
            badge > 0 ? "" : "hidden"
          }`}
        >
          {badge}
        </span>
      )}
    </a>
  );
}

function MobileTab(
  { href, label, icon, currentPath, badge, tour }: {
    href: string;
    label: string;
    icon: (props: { class: string }) => ComponentChildren;
    currentPath: string;
    badge?: number;
    /** Anchor id for the welcome walkthrough (data-tour). */
    tour?: string;
  },
) {
  const active = isActive(currentPath, href);
  const Icon = icon;
  return (
    <a
      href={href}
      data-tour={tour}
      class={`flex flex-col items-center gap-0.5 text-[10px] transition-colors duration-75 relative ${
        active ? "text-orange-400" : "text-stone-400 hover:text-stone-200"
      }`}
    >
      <Icon class="size-5" />
      {badge !== undefined && (
        <span
          data-shopping-badge
          class={`count-badge count-badge-accent absolute -top-0.5 left-1/2 ml-1.5 ${
            badge > 0 ? "" : "hidden"
          }`}
        >
          {badge}
        </span>
      )}
      {label}
    </a>
  );
}

export function Nav(
  { user, shoppingListCount, hasHousehold, isAdmin, currentPath, locale }: {
    user?: User | null;
    shoppingListCount?: number;
    hasHousehold?: boolean;
    isAdmin?: boolean;
    currentPath: string;
    locale: string;
  },
) {
  const m = catalogFor(locale);
  // Reference catalogs and the guide sit behind a menu rather than in the bar:
  // the bar only has room for the core workflow before it wraps.
  const moreLinks: NavDropdownLink[] = [
    { href: "/ingredients", label: m.nav.ingredients(), group: "catalogs" },
    { href: "/stores", label: m.nav.stores(), group: "catalogs" },
    { href: "/tools", label: m.nav.tools(), group: "catalogs" },
    { href: "/docs", label: m.nav.docs(), tour: "docs" },
    ...(isAdmin ? [{ href: "/admin", label: m.nav.admin() }] : []),
  ];
  // Below lg the bar shows none of the links, so the menu carries everything
  // the bottom tab bar has no room for as well.
  const compactLinks: NavDropdownLink[] = [
    ...(hasHousehold
      ? [
        { href: "/agent", label: m.nav.assistant(), tour: "assistant" },
        { href: "/collections", label: m.nav.collections(), tour: "collections" },
      ]
      : []),
    ...moreLinks,
  ];

  return (
    <>
      {/* ── Top bar ── */}
      <nav class="bg-stone-900 text-stone-200 border-b-2 border-orange-600 dark:border-orange-500 pt-[env(safe-area-inset-top)]">
        <div class="max-w-6xl mx-auto px-4 py-3">
          <div class="flex items-center gap-6">
            {/* Brand */}
            <a
              href="/"
              class="flex items-center text-lg font-bold nav-link whitespace-nowrap"
            >
              <IconChefHat class="size-5 inline mr-1" />Foodex
            </a>

            {/* Desktop nav: the core workflow, in the order you'd use it */}
            <div class="hidden lg:flex items-center gap-4 min-w-0">
              <NavLink
                href="/recipes"
                label={m.nav.recipes()}
                tour="recipes"
                currentPath={currentPath}
                locale={locale}
              />
              {hasHousehold && (
                <>
                  <NavLink
                    href="/collections"
                    label={m.nav.collections()}
                    tour="collections"
                    currentPath={currentPath}
                  />
                  <NavLink
                    href="/agent"
                    label={m.nav.assistant()}
                    tour="assistant"
                    currentPath={currentPath}
                  />
                  <NavLink
                    href="/household/pantry"
                    label={m.nav.pantry()}
                    tour="pantry"
                    currentPath={currentPath}
                  />
                  <NavLink
                    href="/plan"
                    label={m.nav.plan()}
                    tour="plan"
                    currentPath={currentPath}
                  />
                </>
              )}
              {user && (
                <NavLink
                  href="/shopping-list"
                  label={m.nav.shoppingList()}
                  tour="shopping"
                  currentPath={currentPath}
                  badge={shoppingListCount ?? 0}
                />
              )}
            </div>

            {/* Right side */}
            <div class="ml-auto flex items-center gap-3">
              <NavDropdown
                id="menu"
                class="lg:hidden"
                trigger={{ kind: "hamburger" }}
                links={compactLinks}
                currentPath={currentPath}
                locale={locale}
              />
              <NavDropdown
                id="more"
                class="hidden lg:block"
                trigger={{ kind: "text", label: m.nav.more() }}
                links={moreLinks}
                currentPath={currentPath}
                locale={locale}
              />
              <DarkModeToggle locale={locale} />
              <a
                href={hasHousehold ? "/household" : "/households"}
                data-tour="household"
                class={`nav-link hidden lg:block ${
                  isActive(currentPath, "/household") ||
                    isActive(currentPath, "/households")
                    ? "text-orange-400"
                    : ""
                }`}
                title={m.nav.household()}
              >
                <IconHome class="size-5" />
              </a>
              {user
                ? (
                  <NavDropdown
                    id="account"
                    trigger={{
                      kind: "avatar",
                      name: user.name,
                      avatarUrl: user.avatar_url,
                    }}
                    links={[{ href: "/profile", label: m.nav.profile() }]}
                    currentPath={currentPath}
                    locale={locale}
                    signOut
                  />
                )
                : (
                  <a
                    href="/auth/login"
                    class="text-sm text-stone-400 hover:text-stone-200 whitespace-nowrap"
                  >
                    {m.nav.signIn()}
                  </a>
                )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tabs ── */}
      <div
        data-mobile-nav
        class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-stone-900 border-t-2 border-orange-600 dark:border-orange-500 px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
      >
        <div class="flex items-center justify-around">
          <MobileTab
            href="/recipes"
            label={m.nav.recipes()}
            tour="recipes"
            icon={IconToolsKitchen2}
            currentPath={currentPath}
          />
          {hasHousehold && (
            <MobileTab
              href="/household/pantry"
              label={m.nav.pantry()}
              tour="pantry"
              icon={IconFridge}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/plan"
              label={m.nav.plan()}
              tour="plan"
              icon={IconCalendar}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/scan"
              label={m.nav.scan()}
              tour="scan"
              icon={IconScan}
              currentPath={currentPath}
            />
          )}
          {user && (
            <MobileTab
              href="/shopping-list"
              label={m.nav.shop()}
              tour="shopping"
              icon={IconShoppingCart}
              currentPath={currentPath}
              badge={shoppingListCount}
            />
          )}
          <MobileTab
            href={hasHousehold ? "/household" : "/households"}
            label={m.nav.household()}
            tour="household"
            icon={IconHome}
            currentPath={currentPath}
          />
        </div>
      </div>
    </>
  );
}
