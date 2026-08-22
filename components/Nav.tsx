import { ComponentChildren } from "preact";
import DarkModeToggle from "../islands/DarkModeToggle.tsx";
import MobileMenu from "../islands/MobileMenu.tsx";
import { IconChefHat } from "@tabler/icons-preact";
import { IconShoppingCart } from "@tabler/icons-preact";
import { IconCalendar } from "@tabler/icons-preact";
import { IconBook } from "@tabler/icons-preact";
import { IconToolsKitchen2 } from "@tabler/icons-preact";
import { IconFridge } from "@tabler/icons-preact";
import { IconHome } from "@tabler/icons-preact";
import { IconScan } from "@tabler/icons-preact";
import { IconShieldCog } from "@tabler/icons-preact";
import type { User } from "../utils.ts";
import { createT } from "./Translation.tsx";
import en from "./Nav.en.mfr";
import it from "./Nav.it.mfr";

const t = createT({ en, it });

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
  const trans = t.use();
  return (
    <>
      {/* ── Top bar ── */}
      <nav class="bg-stone-900 text-stone-200 border-b-2 border-orange-600 dark:border-orange-500 pt-[env(safe-area-inset-top)]">
        <div class="max-w-6xl mx-auto px-4 py-3">
          <div class="flex items-center gap-6">
            {/* Brand */}
            <a href="/" class="flex items-center text-lg font-bold nav-link">
              <IconChefHat class="size-5 inline mr-1" />Foodex
            </a>

            {/* Desktop nav */}
            <div class="hidden sm:contents">
              {/* Primary: core workflow */}
              <div class="flex items-center gap-4">
                <a
                  href="/recipes"
                  data-tour="recipes"
                  class={`nav-link font-medium ${
                    isActive(currentPath, "/recipes") ? "text-orange-400" : ""
                  }`}
                >
                  {t("nav.recipes")}
                </a>
                {hasHousehold && (
                  <a
                    href="/collections"
                    data-tour="collections"
                    class={`nav-link font-medium ${
                      isActive(currentPath, "/collections")
                        ? "text-orange-400"
                        : ""
                    }`}
                  >
                    {t("nav.collections")}
                  </a>
                )}
                {hasHousehold && (
                  <a
                    href="/agent"
                    data-tour="assistant"
                    class={`nav-link font-medium ${
                      isActive(currentPath, "/agent") ? "text-orange-400" : ""
                    }`}
                  >
                    {t("nav.assistant")}
                  </a>
                )}
                {hasHousehold && (
                  <>
                    <a
                      href="/household/pantry"
                      data-tour="pantry"
                      class={`nav-link font-medium ${
                        isActive(currentPath, "/household/pantry")
                          ? "text-orange-400"
                          : ""
                      }`}
                    >
                      {t("nav.pantry")}
                    </a>
                    <a
                      href="/plan"
                      data-tour="plan"
                      class={`nav-link font-medium ${
                        isActive(currentPath, "/plan") ? "text-orange-400" : ""
                      }`}
                    >
                      {t("nav.plan")}
                    </a>
                  </>
                )}
                {user && (
                  <a
                    href="/shopping-list"
                    data-tour="shopping"
                    class={`nav-link font-medium relative ${
                      isActive(currentPath, "/shopping-list")
                        ? "text-orange-400"
                        : ""
                    }`}
                  >
                    {t("nav.shoppingList")}
                    <span
                      data-shopping-badge
                      class={`count-badge count-badge-accent ml-1.5 ${
                        (shoppingListCount ?? 0) > 0 ? "" : "hidden"
                      }`}
                    >
                      {shoppingListCount ?? 0}
                    </span>
                  </a>
                )}
              </div>

              {/* Separator */}
              <div class="w-px h-4 bg-stone-700" />

              {/* Secondary: reference data */}
              <div class="flex items-center gap-3" data-tour="catalogs">
                <a
                  href="/ingredients"
                  class={`nav-link text-sm text-stone-400 ${
                    isActive(currentPath, "/ingredients")
                      ? "!text-orange-400"
                      : "hover:text-stone-200"
                  }`}
                >
                  {t("nav.ingredients")}
                </a>
                <a
                  href="/stores"
                  class={`nav-link text-sm text-stone-400 ${
                    isActive(currentPath, "/stores")
                      ? "!text-orange-400"
                      : "hover:text-stone-200"
                  }`}
                >
                  {t("nav.stores")}
                </a>
                <a
                  href="/tools"
                  class={`nav-link text-sm text-stone-400 ${
                    isActive(currentPath, "/tools")
                      ? "!text-orange-400"
                      : "hover:text-stone-200"
                  }`}
                >
                  {t("nav.tools")}
                </a>
              </div>
            </div>

            {/* Right side */}
            <div class="ml-auto flex items-center gap-3">
              <MobileMenu
                hasHousehold={hasHousehold}
                currentPath={currentPath}
              />
              {isAdmin && (
                <a
                  href="/admin"
                  class={`nav-link ${
                    currentPath.startsWith("/admin") ? "text-orange-400" : ""
                  }`}
                  title={trans("nav.admin")}
                >
                  <IconShieldCog class="size-5" />
                </a>
              )}
              <a
                href="/docs"
                data-tour="docs"
                class={`nav-link hidden sm:block ${
                  currentPath.startsWith("/docs") ? "text-orange-400" : ""
                }`}
                title={trans("nav.docs")}
              >
                <IconBook class="size-5" />
              </a>
              <DarkModeToggle />
              <a
                href={hasHousehold ? "/household" : "/households"}
                data-tour="household"
                class={`nav-link hidden sm:block ${
                  isActive(currentPath, "/household") ||
                    isActive(currentPath, "/households")
                    ? "text-orange-400"
                    : ""
                }`}
                title={trans("nav.household")}
              >
                <IconHome class="size-5" />
              </a>
              {user
                ? (
                  <div class="flex items-center gap-2">
                    <a
                      href="/profile"
                      class="flex items-center gap-2 nav-link"
                    >
                      {user.avatar_url && (
                        <img
                          src={user.avatar_url}
                          alt={user.name ?? ""}
                          class="size-7 rounded-full"
                        />
                      )}
                      <span class="hidden sm:inline text-sm">{user.name}</span>
                    </a>
                    <form
                      method="POST"
                      action="/auth/logout"
                      class="hidden sm:inline"
                    >
                      <button
                        type="submit"
                        class="text-sm text-stone-400 hover:text-stone-200 cursor-pointer"
                      >
                        {t("nav.signOut")}
                      </button>
                    </form>
                  </div>
                )
                : (
                  <a
                    href="/auth/login"
                    class="text-sm text-stone-400 hover:text-stone-200"
                  >
                    {t("nav.signIn")}
                  </a>
                )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tabs ── */}
      <div
        data-mobile-nav
        class="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-stone-900 border-t-2 border-orange-600 dark:border-orange-500 px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
      >
        <div class="flex items-center justify-around">
          <MobileTab
            href="/recipes"
            label={trans("nav.recipes")}
            tour="recipes"
            icon={IconToolsKitchen2}
            currentPath={currentPath}
          />
          {hasHousehold && (
            <MobileTab
              href="/household/pantry"
              label={trans("nav.pantry")}
              tour="pantry"
              icon={IconFridge}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/plan"
              label={trans("nav.plan")}
              tour="plan"
              icon={IconCalendar}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/scan"
              label={trans("nav.scan")}
              tour="scan"
              icon={IconScan}
              currentPath={currentPath}
            />
          )}
          {user && (
            <MobileTab
              href="/shopping-list"
              label={trans("nav.shop")}
              tour="shopping"
              icon={IconShoppingCart}
              currentPath={currentPath}
              badge={shoppingListCount}
            />
          )}
          <MobileTab
            href={hasHousehold ? "/household" : "/households"}
            label={trans("nav.household")}
            tour="household"
            icon={IconHome}
            currentPath={currentPath}
          />
        </div>
      </div>
    </>
  );
}
