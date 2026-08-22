import type { ComponentChildren } from "preact";
import { SearchBar } from "./SearchBar.tsx";
import { useMessages } from "../lib/i18n/provider.tsx";

interface PageHeaderProps {
  title: string;
  query?: string;
  searchPlaceholder?: string;
  /** Query params the search submit keeps (active filters); see SearchBar. */
  searchPreserve?: Record<string, string>;
  children?: ComponentChildren;
  noSearch?: boolean;
}

export function PageHeader(
  { title, query, searchPlaceholder, searchPreserve, children, noSearch }:
    PageHeaderProps,
) {
  const m = useMessages();
  return (
    <div class="mb-6 space-y-3 sm:space-y-0">
      {
        /* min-h matches the 2.5rem input height so pages with and without a
          search bar keep the title row (and everything under it) at the same
          vertical position when switching between them. */
      }
      <div class="flex items-center gap-3 sm:gap-4 min-h-10">
        <h1 class="text-2xl font-bold shrink-0">{title}</h1>
        {!noSearch && (
          <div class="flex-1">
            <SearchBar
              query={query}
              placeholder={searchPlaceholder ??
                m.common.searchPlaceholder({ title })}
              preserve={searchPreserve}
            />
          </div>
        )}
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
