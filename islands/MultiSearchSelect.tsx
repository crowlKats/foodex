import { useSignal } from "@preact/signals";
import TbX from "tb-icons/TbX";

interface Props {
  name: string;
  options: string[];
  initialSelected?: string[];
  placeholder?: string;
}

export default function MultiSearchSelect(
  { name, options, initialSelected, placeholder }: Props,
) {
  const selected = useSignal<string[]>(initialSelected ?? []);
  const query = useSignal("");
  const open = useSignal(false);
  const highlightIndex = useSignal(-1);

  function getFiltered(): string[] {
    const q = query.value.toLowerCase().trim();
    const available = options.filter((o) => !selected.value.includes(o));
    if (!q) return available.slice(0, 20);
    return available.filter((o) => o.toLowerCase().includes(q)).slice(0, 20);
  }

  function add(value: string) {
    if (!selected.value.includes(value)) {
      selected.value = [...selected.value, value];
    }
    query.value = "";
    highlightIndex.value = -1;
  }

  function remove(value: string) {
    selected.value = selected.value.filter((v) => v !== value);
  }

  function handleKeyDown(e: KeyboardEvent) {
    const filtered = getFiltered();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIndex.value = Math.min(
        highlightIndex.value + 1,
        filtered.length - 1,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex.value >= 0 && filtered[highlightIndex.value]) {
        add(filtered[highlightIndex.value]);
      }
    } else if (e.key === "Escape") {
      open.value = false;
      highlightIndex.value = -1;
    } else if (
      e.key === "Backspace" && query.value === "" &&
      selected.value.length > 0
    ) {
      selected.value = selected.value.slice(0, -1);
    }
  }

  const filtered = getFiltered();

  return (
    <div class="relative">
      {selected.value.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      {selected.value.length > 0 && (
        <div class="flex flex-wrap gap-1.5 mb-1.5">
          {selected.value.map((v) => (
            <span
              key={v}
              class="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-sm px-2 py-0.5 capitalize"
            >
              {v}
              <button
                type="button"
                class="text-orange-400 hover:text-orange-700 dark:hover:text-orange-200 cursor-pointer"
                onClick={() => remove(v)}
              >
                <TbX class="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder={placeholder ?? "Search..."}
        value={query}
        class="w-full text-sm"
        onInput={(e) => {
          query.value = (e.target as HTMLInputElement).value;
          open.value = true;
          highlightIndex.value = -1;
        }}
        onFocus={() => {
          open.value = true;
        }}
        onBlur={() => {
          setTimeout(() => {
            open.value = false;
          }, 150);
        }}
        onKeyDown={handleKeyDown}
      />
      {open.value && filtered.length > 0 && (
        <div class="absolute z-10 left-0 right-0 mt-0.5 bg-white dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-600 max-h-48 overflow-y-auto shadow-lg">
          {filtered.map((o, idx) => (
            <button
              key={o}
              type="button"
              class={`block w-full text-left px-3 py-1.5 text-sm cursor-pointer capitalize ${
                idx === highlightIndex.value
                  ? "bg-orange-100 dark:bg-orange-900"
                  : "hover:bg-stone-100 dark:hover:bg-stone-700"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o);
              }}
              onMouseEnter={() => {
                highlightIndex.value = idx;
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
