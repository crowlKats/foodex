import TbSearch from "tb-icons/TbSearch";
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
        icon={TbSearch}
        autocomplete="off"
      />
    </form>
  );
}
