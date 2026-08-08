import { IconSearch } from "@tabler/icons-preact";
import { Input } from "./Input.tsx";

interface SearchBarProps {
  query?: string;
  placeholder?: string;
  /** Query params to carry through the search submit (active filters). */
  preserve?: Record<string, string>;
}

export function SearchBar(
  { query, placeholder = "Search...", preserve }: SearchBarProps,
) {
  return (
    <form method="GET">
      {Object.entries(preserve ?? {}).filter(([, v]) => v).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input
        type="search"
        name="q"
        value={query ?? ""}
        placeholder={placeholder}
        icon={IconSearch}
        autocomplete="off"
      />
    </form>
  );
}
