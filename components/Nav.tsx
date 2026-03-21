import DarkModeToggle from "../islands/DarkModeToggle.tsx";
import TbChefHat from "tb-icons/TbChefHat";
import TbShoppingCart from "tb-icons/TbShoppingCart";
import type { User } from "../utils.ts";

export function Nav(
  { user, shoppingListCount, hasHousehold }: {
    user?: User | null;
    shoppingListCount?: number;
    hasHousehold?: boolean;
  },
) {
  return (
    <nav class="bg-stone-900 text-stone-200 border-b-2 border-orange-600 dark:border-orange-500">
      <div class="max-w-6xl mx-auto px-4 py-3">
        <div class="flex items-center gap-4 sm:gap-6">
          <a href="/" class="flex items-center text-lg font-bold nav-link">
            <TbChefHat class="size-5 inline mr-1" />Foodex
          </a>
          <div class="hidden sm:flex items-center gap-6">
            <a href="/recipes" class="nav-link">Recipes</a>
            <a href="/ingredients" class="nav-link">Ingredients</a>
            <a href="/stores" class="nav-link">Stores</a>
            <a href="/tools" class="nav-link">Tools</a>
            {hasHousehold && <a href="/household/pantry" class="nav-link">Pantry</a>}
            <a href={hasHousehold ? "/household" : "/households"} class="nav-link">Household</a>
          </div>
          <div class="ml-auto flex items-center gap-3">
            {user && (
              <a
                href="/shopping-list"
                class="nav-link relative"
                title="Shopping List"
              >
                <TbShoppingCart class="size-5" />
                {(shoppingListCount ?? 0) > 0 && (
                  <span class="absolute -top-1.5 -right-2 bg-orange-600 text-white text-[10px] font-bold leading-none px-1 py-0.5 rounded-full min-w-4 text-center">
                    {shoppingListCount}
                  </span>
                )}
              </a>
            )}
            <DarkModeToggle />
            {user
              ? (
                <div class="flex items-center gap-2">
                  <a href="/profile" class="flex items-center gap-2 nav-link">
                    {user.avatar_url && (
                      <img
                        src={user.avatar_url}
                        alt={user.name}
                        class="size-7 rounded-full"
                      />
                    )}
                    <span class="hidden sm:inline text-sm">{user.name}</span>
                  </a>
                  <form method="POST" action="/auth/logout" class="inline">
                    <button
                      type="submit"
                      class="text-sm text-stone-400 hover:text-stone-200"
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
        <div class="flex sm:hidden items-center justify-around mt-2">
          <a href="/recipes" class="nav-link text-sm">Recipes</a>
          <a href="/ingredients" class="nav-link text-sm">Ingredients</a>
          <a href="/stores" class="nav-link text-sm">Stores</a>
          <a href="/tools" class="nav-link text-sm">Tools</a>
          {hasHousehold && <a href="/household/pantry" class="nav-link text-sm">Pantry</a>}
          <a href={hasHousehold ? "/household" : "/households"} class="nav-link text-sm">Household</a>
        </div>
      </div>
    </nav>
  );
}
