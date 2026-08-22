import { ButtonLink } from "./Button.tsx";
import { useMessages } from "../lib/i18n/provider.tsx";

export const PAGE_SIZE = 50;

export function getPage(url: URL): number {
  const p = parseInt(url.searchParams.get("page") ?? "1");
  return p > 0 ? p : 1;
}

export function paginationParams(
  pageNum: number,
): { limit: number; offset: number } {
  return { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE };
}

export function Pagination(
  { currentPage, totalCount, url }: {
    currentPage: number;
    totalCount: number;
    url: URL;
  },
) {
  const m = useMessages();
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages <= 1) return null;

  function pageUrl(p: number): string {
    const u = new URL(url);
    if (p > 1) u.searchParams.set("page", String(p));
    else u.searchParams.delete("page");
    return u.pathname + u.search;
  }

  return (
    <div class="flex items-center justify-center gap-2 mt-4">
      {currentPage > 1 && (
        <ButtonLink href={pageUrl(currentPage - 1)} variant="outline">
          {m.common.prev()}
        </ButtonLink>
      )}
      <span class="text-sm text-stone-500">
        {m.common.pageOf({ current: currentPage, total: totalPages })}
      </span>
      {currentPage < totalPages && (
        <ButtonLink href={pageUrl(currentPage + 1)} variant="outline">
          {m.common.next()}
        </ButtonLink>
      )}
    </div>
  );
}
