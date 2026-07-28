import { IconSearch } from "@tabler/icons-preact";
import { Input } from "./Input.tsx";

interface SearchBarProps {
  query?: string;
  placeholder?: string;
}

export function SearchBar(
  { query, placeholder = "Search..." }: SearchBarProps,
) {
  return (
    <form method="GET">
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
