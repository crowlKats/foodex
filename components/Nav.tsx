import DarkModeToggle from "../islands/DarkModeToggle.tsx";
import TbChefHat from "tb-icons/TbChefHat";

export function Nav() {
  return (
    <nav class="bg-stone-900 text-stone-200 border-b-2 border-orange-600 dark:border-orange-500">
      <div class="max-w-6xl mx-auto px-4 py-3">
        <div class="flex items-center gap-4 sm:gap-6">
          <a href="/" class="flex items-center text-lg font-bold nav-link">
            <TbChefHat class="size-5 inline mr-1" />Foodex
          </a>
          <div class="hidden sm:flex items-center gap-6">
            <a href="/recipes" class="nav-link">Recipes</a>
            <a href="/groceries" class="nav-link">Groceries</a>
            <a href="/stores" class="nav-link">Stores</a>
            <a href="/tools" class="nav-link">Tools</a>
          </div>
          <div class="ml-auto">
            <DarkModeToggle />
          </div>
        </div>
        <div class="flex sm:hidden items-center justify-around mt-2">
          <a href="/recipes" class="nav-link text-sm">Recipes</a>
          <a href="/groceries" class="nav-link text-sm">Groceries</a>
          <a href="/stores" class="nav-link text-sm">Stores</a>
          <a href="/tools" class="nav-link text-sm">Tools</a>
        </div>
      </div>
    </nav>
  );
}
