import { useSignal } from "@preact/signals";
import TbX from "tb-icons/TbX";
import TbGripVertical from "tb-icons/TbGripVertical";

interface RecipeOption {
  id: string;
  title: string;
}

interface Props {
  options: RecipeOption[];
  initialSelected?: RecipeOption[];
}

export default function RecipePicker({ options, initialSelected }: Props) {
  const selected = useSignal<RecipeOption[]>(initialSelected ?? []);
  const query = useSignal("");
  const open = useSignal(false);
  const highlightIndex = useSignal(-1);
  const dragIndex = useSignal<number | null>(null);

  function getFiltered(): RecipeOption[] {
    const q = query.value.toLowerCase().trim();
    const selectedIds = new Set(selected.value.map((s) => s.id));
    const available = options.filter((o) => !selectedIds.has(o.id));
    if (!q) return available.slice(0, 20);
    return available.filter((o) => o.title.toLowerCase().includes(q)).slice(
      0,
      20,
    );
  }

  function add(option: RecipeOption) {
    selected.value = [...selected.value, option];
    query.value = "";
    highlightIndex.value = -1;
  }

  function remove(id: string) {
    selected.value = selected.value.filter((v) => v.id !== id);
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

  function handleDragStart(idx: number) {
    dragIndex.value = idx;
  }

  function handleDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex.value === null || dragIndex.value === idx) return;
    const items = [...selected.value];
    const [moved] = items.splice(dragIndex.value, 1);
    items.splice(idx, 0, moved);
    selected.value = items;
    dragIndex.value = idx;
  }

  function handleDragEnd() {
    dragIndex.value = null;
  }

  const filtered = getFiltered();

  return (
    <div class="space-y-2">
      {selected.value.map((r, idx) => (
        <input key={r.id} type="hidden" name="recipe_id" value={r.id} />
      ))}
      {selected.value.length > 0 && (
        <div class="space-y-1">
          {selected.value.map((r, idx) => (
            <div
              key={r.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              class={`flex items-center gap-2 bg-stone-100 dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-700 px-2 py-1.5 text-sm ${
                dragIndex.value === idx ? "opacity-50" : ""
              }`}
            >
              <TbGripVertical class="size-4 text-stone-400 cursor-grab shrink-0" />
              <span class="flex-1">{r.title}</span>
              <button
                type="button"
                class="text-stone-400 hover:text-red-500 cursor-pointer shrink-0"
                onClick={() => remove(r.id)}
              >
                <TbX class="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div class="relative">
        <input
          type="text"
          placeholder="Search recipes to add..."
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
                key={o.id}
                type="button"
                class={`block w-full text-left px-3 py-1.5 text-sm cursor-pointer ${
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
                {o.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
