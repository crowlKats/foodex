import TbSearch from "tb-icons/TbSearch";

interface SearchBarProps {
  query?: string;
  placeholder?: string;
}

export function SearchBar(
  { query, placeholder = "Search..." }: SearchBarProps,
) {
  return (
    <form method="GET">
      <div class="relative">
        <TbSearch class="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          name="q"
          value={query ?? ""}
          placeholder={placeholder}
          class="w-full !pl-10 search-input"
          autocomplete="off"
        />
      </div>
    </form>
  );
}
