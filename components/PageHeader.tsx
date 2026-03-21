import type { ComponentChildren } from "preact";
import { SearchBar } from "./SearchBar.tsx";

interface PageHeaderProps {
  title: string;
  query?: string;
  searchPlaceholder?: string;
  children?: ComponentChildren;
  noSearch?: boolean;
}

export function PageHeader(
  { title, query, searchPlaceholder, children, noSearch }: PageHeaderProps,
) {
  return (
    <div class="mb-6 space-y-3 sm:space-y-0">
      <div class="flex items-center gap-3 sm:gap-4">
        <h1 class="text-2xl font-bold shrink-0">{title}</h1>
        {!noSearch && <div class="flex-1">
          <SearchBar
            query={query}
            placeholder={searchPlaceholder ??
              `Search ${title.toLowerCase()}...`}
          />
        </div>}
        {children && (
          <div class="hidden sm:flex gap-2">
            {children}
          </div>
        )}
      </div>
      {children && (
        <div class="flex gap-2 [&>*]:flex-1 sm:hidden">
          {children}
        </div>
      )}
    </div>
  );
}
