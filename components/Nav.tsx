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
  { user, shoppingListCount, hasHousehold, isAdmin, currentPath }: {
    user?: User | null;
    shoppingListCount?: number;
    hasHousehold?: boolean;
    isAdmin?: boolean;
    currentPath: string;
  },
) {
  // Reference catalogs and the guide sit behind a menu rather than in the bar:
  // the bar only has room for the core workflow before it wraps.
  const moreLinks: NavDropdownLink[] = [
    { href: "/ingredients", label: "Ingredients" },
    { href: "/stores", label: "Stores" },
    { href: "/tools", label: "Tools" },
    { href: "/docs", label: "User guide" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  // Below lg the bar shows none of the links, so the menu carries everything
  // the bottom tab bar has no room for as well.
  const compactLinks: NavDropdownLink[] = [
    ...(hasHousehold
      ? [
        { href: "/agent", label: "Assistant" },
        { href: "/collections", label: "Collections" },
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
                label="Recipes"
                tour="recipes"
                currentPath={currentPath}
              />
              {hasHousehold && (
                <>
                  <NavLink
                    href="/collections"
                    label="Collections"
                    tour="collections"
                    currentPath={currentPath}
                  />
                  <NavLink
                    href="/agent"
                    label="Assistant"
                    tour="assistant"
                    currentPath={currentPath}
                  />
                  <NavLink
                    href="/household/pantry"
                    label="Pantry"
                    tour="pantry"
                    currentPath={currentPath}
                  />
                  <NavLink
                    href="/plan"
                    label="Plan"
                    tour="plan"
                    currentPath={currentPath}
                  />
                </>
              )}
              {user && (
                <NavLink
                  href="/shopping-list"
                  label="Shopping List"
                  tour="shopping"
                  currentPath={currentPath}
                  badge={shoppingListCount ?? 0}
                />
              )}
            </div>

            {/* Right side */}
            <div class="ml-auto flex items-center gap-3">
              <NavDropdown
                class="lg:hidden"
                tour="menu"
                trigger={{ kind: "hamburger" }}
                links={compactLinks}
                currentPath={currentPath}
              />
              <NavDropdown
                class="hidden lg:block"
                tour="catalogs"
                trigger={{ kind: "text", label: "More" }}
                links={moreLinks}
                currentPath={currentPath}
              />
              <DarkModeToggle />
              <a
                href={hasHousehold ? "/household" : "/households"}
                data-tour="household"
                class={`nav-link hidden lg:block ${
                  isActive(currentPath, "/household") ||
                    isActive(currentPath, "/households")
                    ? "text-orange-400"
                    : ""
                }`}
                title="Household"
              >
                <IconHome class="size-5" />
              </a>
              {user
                ? (
                  <NavDropdown
                    trigger={{
                      kind: "avatar",
                      name: user.name,
                      avatarUrl: user.avatar_url,
                    }}
                    links={[{ href: "/profile", label: "Profile" }]}
                    currentPath={currentPath}
                    signOut
                  />
                )
                : (
                  <a
                    href="/auth/login"
                    class="text-sm text-stone-400 hover:text-stone-200 whitespace-nowrap"
                  >
                    Sign in
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
            label="Recipes"
            tour="recipes"
            icon={IconToolsKitchen2}
            currentPath={currentPath}
          />
          {hasHousehold && (
            <MobileTab
              href="/household/pantry"
              label="Pantry"
              tour="pantry"
              icon={IconFridge}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/plan"
              label="Plan"
              tour="plan"
              icon={IconCalendar}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/scan"
              label="Scan"
              tour="scan"
              icon={IconScan}
              currentPath={currentPath}
            />
          )}
          {user && (
            <MobileTab
              href="/shopping-list"
              label="Shop"
              tour="shopping"
              icon={IconShoppingCart}
              currentPath={currentPath}
              badge={shoppingListCount}
            />
          )}
          <MobileTab
            href={hasHousehold ? "/household" : "/households"}
            label="Household"
            tour="household"
            icon={IconHome}
            currentPath={currentPath}
          />
        </div>
      </div>
    </>
  );
}
