import { useSignal } from "@preact/signals";
import TbX from "tb-icons/TbX";

export interface SearchSelectOption {
  id: string;
  name: string;
  detail?: string;
}

interface SearchSelectProps {
  value: { id: string; name: string };
  options: SearchSelectOption[];
  placeholder?: string;
  onSelect: (option: SearchSelectOption) => void;
  onClear: () => void;
  onChange?: (text: string) => void;
}

export default function SearchSelect(
  { value, options, placeholder, onSelect, onClear, onChange }: SearchSelectProps,
) {
  const query = useSignal(value.name);
  const open = useSignal(false);
  const highlightIndex = useSignal(-1);
  const linked = useSignal(!!value.id);

  function getFiltered(): SearchSelectOption[] {
    const q = query.value.toLowerCase().trim();
    if (!q) return options.slice(0, 20);
    return options.filter((o) =>
      o.name.toLowerCase().includes(q)
    ).slice(0, 20);
  }

  function select(o: SearchSelectOption) {
    query.value = o.name;
    linked.value = true;
    open.value = false;
    highlightIndex.value = -1;
    onSelect(o);
  }

  function clear() {
    query.value = "";
    linked.value = false;
    highlightIndex.value = -1;
    onClear();
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
        select(filtered[highlightIndex.value]);
      }
    } else if (e.key === "Escape") {
      open.value = false;
      highlightIndex.value = -1;
    }
  }

  const filtered = getFiltered();

  return (
    <div class="relative flex-1">
      <div class="flex items-center">
        <input
          type="text"
          placeholder={placeholder ?? "Search..."}
          value={query}
          class={`flex-1 text-sm ${linked.value ? "border-green-500 dark:border-green-600" : ""}`}
          onInput={(e) => {
            const text = (e.target as HTMLInputElement).value;
            query.value = text;
            open.value = true;
            highlightIndex.value = -1;
            if (linked.value) {
              linked.value = false;
              onClear();
            }
            onChange?.(text);
          }}
          onFocus={() => { open.value = true; }}
          onBlur={() => {
            setTimeout(() => { open.value = false; }, 150);
          }}
          onKeyDown={handleKeyDown}
        />
        {linked.value && (
          <button
            type="button"
            class="text-stone-400 hover:text-red-500 px-1.5 cursor-pointer"
            onClick={clear}
            title="Clear selection"
          >
            <TbX class="size-3.5" />
          </button>
        )}
      </div>
      {open.value && filtered.length > 0 && (
        <div class="absolute z-10 left-0 right-0 mt-0.5 bg-white dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-600 max-h-48 overflow-y-auto shadow-lg">
          {filtered.map((o, idx) => (
            <button
              key={o.id}
              type="button"
              class={`block w-full text-left px-3 py-1.5 text-sm cursor-pointer ${
                idx === highlightIndex.value
                  ? "bg-orange-100 dark:bg-orange-900"
                  : "hover:bg-stone-100 dark:hover:bg-stone-700"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                select(o);
              }}
              onMouseEnter={() => { highlightIndex.value = idx; }}
            >
              <span class="font-medium">{o.name}</span>
              {o.detail && (
                <span class="text-stone-400 ml-1 text-xs">({o.detail})</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
