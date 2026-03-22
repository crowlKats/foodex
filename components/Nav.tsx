import DarkModeToggle from "../islands/DarkModeToggle.tsx";
import TbChefHat from "tb-icons/TbChefHat";
import TbShoppingCart from "tb-icons/TbShoppingCart";
import TbBook from "tb-icons/TbBook";
import TbToolsKitchen2 from "tb-icons/TbToolsKitchen2";
import TbFridge from "tb-icons/TbFridge";
import TbHome from "tb-icons/TbHome";
import TbBooks from "tb-icons/TbBooks";
import TbScan from "tb-icons/TbScan";
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

function MobileTab(
  { href, label, icon, currentPath, badge }: {
    href: string;
    label: string;
    icon: preact.ComponentType<{ class?: string }>;
    currentPath: string;
    badge?: number;
  },
) {
  const active = isActive(currentPath, href);
  const Icon = icon;
  return (
    <a
      href={href}
      class={`flex flex-col items-center gap-0.5 text-[10px] transition-colors duration-75 relative ${
        active ? "text-orange-400" : "text-stone-400 hover:text-stone-200"
      }`}
    >
      <Icon class="size-5" />
      {(badge ?? 0) > 0 && (
        <span class="absolute -top-0.5 left-1/2 ml-1.5 bg-orange-600 text-white text-[9px] font-bold leading-none px-1 py-0.5 rounded-full min-w-3.5 text-center">
          {badge}
        </span>
      )}
      {label}
    </a>
  );
}

export function Nav(
  { user, shoppingListCount, hasHousehold, currentPath }: {
    user?: User | null;
    shoppingListCount?: number;
    hasHousehold?: boolean;
    currentPath: string;
  },
) {
  return (
    <>
      {/* ── Top bar ── */}
      <nav class="bg-stone-900 text-stone-200 border-b-2 border-orange-600 dark:border-orange-500 pt-[env(safe-area-inset-top)]">
        <div class="max-w-6xl mx-auto px-4 py-3">
          <div class="flex items-center gap-6">
            {/* Brand */}
            <a href="/" class="flex items-center text-lg font-bold nav-link">
              <TbChefHat class="size-5 inline mr-1" />Foodex
            </a>

            {/* Desktop nav */}
            <div class="hidden sm:contents">
              {/* Primary: core workflow */}
              <div class="flex items-center gap-4">
                <a
                  href="/recipes"
                  class={`nav-link font-medium ${
                    isActive(currentPath, "/recipes") ? "text-orange-400" : ""
                  }`}
                >
                  Recipes
                </a>
                {hasHousehold && (
                  <a
                    href="/collections"
                    class={`nav-link font-medium ${
                      isActive(currentPath, "/collections")
                        ? "text-orange-400"
                        : ""
                    }`}
                  >
                    Collections
                  </a>
                )}
                {hasHousehold && (
                  <>
                    <a
                      href="/household/pantry"
                      class={`nav-link font-medium ${
                        isActive(currentPath, "/household/pantry")
                          ? "text-orange-400"
                          : ""
                      }`}
                    >
                      Pantry
                    </a>
                  </>
                )}
                {user && (
                  <a
                    href="/shopping-list"
                    class={`nav-link font-medium relative ${
                      isActive(currentPath, "/shopping-list")
                        ? "text-orange-400"
                        : ""
                    }`}
                  >
                    Shopping List
                    {(shoppingListCount ?? 0) > 0 && (
                      <span class="ml-1.5 bg-orange-600 text-white text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full">
                        {shoppingListCount}
                      </span>
                    )}
                  </a>
                )}
              </div>

              {/* Separator */}
              <div class="w-px h-4 bg-stone-700" />

              {/* Secondary: reference data */}
              <div class="flex items-center gap-3">
                <a
                  href="/ingredients"
                  class={`nav-link text-sm text-stone-400 ${
                    isActive(currentPath, "/ingredients")
                      ? "!text-orange-400"
                      : "hover:text-stone-200"
                  }`}
                >
                  Ingredients
                </a>
                <a
                  href="/stores"
                  class={`nav-link text-sm text-stone-400 ${
                    isActive(currentPath, "/stores")
                      ? "!text-orange-400"
                      : "hover:text-stone-200"
                  }`}
                >
                  Stores
                </a>
                <a
                  href="/tools"
                  class={`nav-link text-sm text-stone-400 ${
                    isActive(currentPath, "/tools")
                      ? "!text-orange-400"
                      : "hover:text-stone-200"
                  }`}
                >
                  Tools
                </a>
              </div>
            </div>

            {/* Right side */}
            <div class="ml-auto flex items-center gap-3">
              {hasHousehold && (
                <a
                  href="/collections"
                  class={`nav-link sm:hidden ${
                    isActive(currentPath, "/collections")
                      ? "text-orange-400"
                      : ""
                  }`}
                  title="Collections"
                >
                  <TbBooks class="size-5" />
                </a>
              )}
              <a
                href="/docs/guide"
                class={`nav-link hidden sm:block ${
                  currentPath.startsWith("/docs") ? "text-orange-400" : ""
                }`}
                title="User Guide"
              >
                <TbBook class="size-5" />
              </a>
              <DarkModeToggle />
              <a
                href={hasHousehold ? "/household" : "/households"}
                class={`nav-link hidden sm:block ${
                  isActive(currentPath, "/household") ||
                    isActive(currentPath, "/households")
                    ? "text-orange-400"
                    : ""
                }`}
                title="Household"
              >
                <TbHome class="size-5" />
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
                          alt={user.name}
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
                        Sign out
                      </button>
                    </form>
                  </div>
                )
                : (
                  <a
                    href="/auth/login"
                    class="text-sm text-stone-400 hover:text-stone-200"
                  >
                    Sign in
                  </a>
                )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tabs ── */}
      <div data-mobile-nav class="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-stone-900 border-t-2 border-orange-600 dark:border-orange-500 px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        <div class="flex items-center justify-around">
          <MobileTab
            href="/recipes"
            label="Recipes"
            icon={TbToolsKitchen2}
            currentPath={currentPath}
          />
          {hasHousehold && (
            <MobileTab
              href="/household/pantry"
              label="Pantry"
              icon={TbFridge}
              currentPath={currentPath}
            />
          )}
          {hasHousehold && (
            <MobileTab
              href="/scan"
              label="Scan"
              icon={TbScan}
              currentPath={currentPath}
            />
          )}
          {user && (
            <MobileTab
              href="/shopping-list"
              label="Shop"
              icon={TbShoppingCart}
              currentPath={currentPath}
              badge={shoppingListCount}
            />
          )}
          <MobileTab
            href={hasHousehold ? "/household" : "/households"}
            label="Household"
            icon={TbHome}
            currentPath={currentPath}
          />
        </div>
      </div>
    </>
  );
}
