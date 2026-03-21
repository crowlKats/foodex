export const PAGE_SIZE = 50;

export function getPage(url: URL): number {
  const p = parseInt(url.searchParams.get("page") ?? "1");
  return p > 0 ? p : 1;
}

export function paginationParams(pageNum: number): { limit: number; offset: number } {
  return { limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE };
}

export function Pagination(
  { currentPage, totalCount, url }: {
    currentPage: number;
    totalCount: number;
    url: URL;
  },
) {
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
        <a href={pageUrl(currentPage - 1)} class="btn btn-outline text-sm">
          Prev
        </a>
      )}
      <span class="text-sm text-stone-500">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages && (
        <a href={pageUrl(currentPage + 1)} class="btn btn-outline text-sm">
          Next
        </a>
      )}
    </div>
  );
}
