import { useSignal } from "@preact/signals";
import TbChevronDown from "tb-icons/TbChevronDown";
import TbSortAscending from "tb-icons/TbSortAscending";
import TbSortDescending from "tb-icons/TbSortDescending";

interface SortOption {
  value: string;
  label: string;
  href: string;
}

interface SortSelectProps {
  options: SortOption[];
  current: string;
  desc: boolean;
  toggleHref: string;
}

export default function SortSelect(
  { options, current, desc, toggleHref }: SortSelectProps,
) {
  const currentOption = options.find((o) => o.value === current) ?? options[0];
  const open = useSignal(false);
  const highlightIndex = useSignal(-1);

  function select(o: SortOption) {
    open.value = false;
    highlightIndex.value = -1;
    location.href = o.href;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open.value) {
        open.value = true;
        highlightIndex.value = 0;
      } else {
        highlightIndex.value = Math.min(
          highlightIndex.value + 1,
          options.length - 1,
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open.value) {
        open.value = true;
        highlightIndex.value = 0;
      } else if (
        highlightIndex.value >= 0 && options[highlightIndex.value]
      ) {
        select(options[highlightIndex.value]);
      }
    } else if (e.key === "Escape") {
      open.value = false;
      highlightIndex.value = -1;
    }
  }

  const Icon = desc ? TbSortDescending : TbSortAscending;

  return (
    <div class="flex items-center">
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-1.5 border-2 border-r-0 border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm h-[2.5rem] cursor-pointer focus:outline-none focus:border-orange-600 dark:focus:border-orange-500 transition-colors duration-75"
          onClick={() => {
            open.value = !open.value;
            highlightIndex.value = -1;
          }}
          onBlur={() => {
            setTimeout(() => {
              open.value = false;
              highlightIndex.value = -1;
            }, 150);
          }}
          onKeyDown={handleKeyDown}
        >
          {currentOption.label}
          <TbChevronDown class="size-4 text-stone-400" />
        </button>
        {open.value && (
          <div class="absolute z-10 left-0 right-0 mt-0.5 bg-white dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-600 max-h-48 overflow-y-auto shadow-lg">
            {options.map((o, idx) => (
              <button
                key={o.value}
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
                onMouseEnter={() => {
                  highlightIndex.value = idx;
                }}
              >
                <span class={o.value === current ? "font-medium" : ""}>
                  {o.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <a
        href={toggleHref}
        class="flex items-center border-2 border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 px-2 py-2 text-sm h-[2.5rem] transition-colors duration-75"
        title={desc ? "Descending" : "Ascending"}
      >
        <Icon class="size-4" />
      </a>
    </div>
  );
}
