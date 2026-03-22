import { useSignal } from "@preact/signals";
import { formatAmount } from "../lib/format.ts";

interface SharedItem {
  id: number;
  name: string;
  amount: number | null;
  unit: string | null;
  checked: boolean;
  recipe_title: string | null;
}

interface Props {
  initialItems: SharedItem[];
  token: string;
}

export default function SharedShoppingList({ initialItems, token }: Props) {
  const items = useSignal<SharedItem[]>(initialItems);

  async function toggleChecked(item: SharedItem) {
    const newChecked = !item.checked;
    items.value = items.value.map((i) =>
      i.id === item.id ? { ...i, checked: newChecked } : i
    );
    await fetch("/api/shopping-list-shared", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action: "toggle_checked",
        item_id: item.id,
        checked: newChecked,
      }),
    });
  }

  const unchecked = items.value.filter((i) => !i.checked);
  const checked = items.value.filter((i) => i.checked);

  if (items.value.length === 0) {
    return (
      <div class="card text-center py-8">
        <p class="text-stone-500">This shopping list is empty.</p>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="space-y-1">
        {unchecked.map((item) => (
          <div
            key={item.id}
            class="card flex items-center gap-3 py-3 px-4 cursor-pointer"
            onClick={() => toggleChecked(item)}
          >
            <input
              type="checkbox"
              checked={false}
              class="size-5 cursor-pointer accent-orange-600 shrink-0"
              onChange={() => toggleChecked(item)}
              onClick={(e) => e.stopPropagation()}
            />
            <div class="flex-1 min-w-0">
              <div class="text-base font-medium">
                {item.amount != null && (
                  <span class="text-orange-600 mr-1">
                    {formatAmount(item.amount)}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                )}
                {item.name}
              </div>
              {item.recipe_title && (
                <div class="text-xs text-stone-400">{item.recipe_title}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {checked.length > 0 && (
        <div>
          <h3 class="text-sm font-semibold text-stone-400 mb-1">
            Done ({checked.length})
          </h3>
          <div class="space-y-1 opacity-50">
            {checked.map((item) => (
              <div
                key={item.id}
                class="card flex items-center gap-3 py-3 px-4 cursor-pointer"
                onClick={() => toggleChecked(item)}
              >
                <input
                  type="checkbox"
                  checked
                  class="size-5 cursor-pointer accent-orange-600 shrink-0"
                  onChange={() => toggleChecked(item)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span class="flex-1 text-base line-through">
                  {item.amount != null && (
                    <span class="mr-1">
                      {formatAmount(item.amount)}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  )}
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
