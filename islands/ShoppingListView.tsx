import { useSignal } from "@preact/signals";
import { computeIngredientCost } from "../lib/unit-convert.ts";
import { getCurrencySymbol } from "../lib/currencies.ts";
import { formatAmount, formatCurrency } from "../lib/format.ts";
import SearchSelect from "./SearchSelect.tsx";
import type { SearchSelectOption } from "./SearchSelect.tsx";
import { UNIT_GROUPS } from "../lib/units.ts";

interface ShoppingItem {
  id: number;
  ingredient_id: number | null;
  name: string;
  amount: number | null;
  unit: string | null;
  store_id: number | null;
  checked: boolean;
  recipe_title: string | null;
  recipe_slug: string | null;
}

interface Store {
  id: number;
  name: string;
  currency: string;
}

interface PriceInfo {
  store_id: number;
  price: number;
  amount: number;
  unit: string;
  currency: string;
  density: number | null;
}

interface IngredientOption {
  id: string;
  name: string;
  unit?: string;
}

interface Props {
  initialItems: ShoppingItem[];
  stores: Store[];
  pricesMap: Record<string, PriceInfo[]>;
  initialViewMode: ViewMode;
  ingredients: IngredientOption[];
}

type ViewMode = "recipe" | "store";

async function apiCall(body: Record<string, unknown>) {
  const res = await fetch("/api/shopping-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const STORE_COL = "w-28 shrink-0";
const PRICE_COL = "w-16 shrink-0 text-right";
const REMOVE_COL = "w-5 shrink-0 text-center";
const CHECK_COL = "w-5 shrink-0";

export default function ShoppingListView(
  { initialItems, stores, pricesMap, initialViewMode, ingredients }: Props,
) {
  const items = useSignal<ShoppingItem[]>(initialItems);
  const viewMode = useSignal<ViewMode>(initialViewMode);
  const addSelected = useSignal<{ id: string; name: string }>({
    id: "",
    name: "",
  });
  const addName = useSignal("");
  const addAmount = useSignal("");
  const addUnit = useSignal("");
  const adding = useSignal(false);

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    document.cookie = `sl_view=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  function getCost(
    ingredientId: number | null,
    amount: number | null,
    unit: string | null,
    storeId: number | null,
  ): { cost: number; currency: string } | null {
    if (ingredientId == null || amount == null) return null;
    const prices = pricesMap[String(ingredientId)];
    if (!prices || prices.length === 0) return null;

    const price = storeId
      ? prices.find((p) => p.store_id === storeId)
      : prices[0];
    if (!price) return null;

    const cost = computeIngredientCost(
      amount,
      unit ?? "",
      price.price,
      price.amount,
      price.unit,
      price.density,
    );
    if (cost == null) return null;
    return { cost, currency: price.currency };
  }

  function getStoresForItem(ingredientId: number | null): Store[] {
    if (ingredientId == null) return [];
    const prices = pricesMap[String(ingredientId)];
    if (!prices || prices.length === 0) return [];
    const withPrice = new Set(prices.map((p) => p.store_id));
    return stores.filter((s) => withPrice.has(s.id));
  }

  async function toggleChecked(item: ShoppingItem) {
    const newChecked = !item.checked;
    items.value = items.value.map((i) =>
      i.id === item.id ? { ...i, checked: newChecked } : i
    );
    await apiCall({
      action: "update_item",
      item_id: item.id,
      checked: newChecked,
    });
  }

  async function updateStore(item: ShoppingItem, storeId: number | null) {
    items.value = items.value.map((i) =>
      i.id === item.id ? { ...i, store_id: storeId } : i
    );
    await apiCall({
      action: "update_item",
      item_id: item.id,
      store_id: storeId,
    });
  }

  async function removeItem(item: ShoppingItem) {
    items.value = items.value.filter((i) => i.id !== item.id);
    await apiCall({ action: "remove_item", item_id: item.id });
  }

  async function clearChecked() {
    items.value = items.value.filter((i) => !i.checked);
    await apiCall({ action: "clear_checked" });
  }

  async function clearAll() {
    items.value = [];
    await apiCall({ action: "clear_all" });
  }

  const addOptions: SearchSelectOption[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    detail: i.unit,
  }));

  async function addItem() {
    const name = addSelected.value.id
      ? addSelected.value.name
      : addName.value.trim();
    if (!name) return;

    adding.value = true;
    const ingredientId = addSelected.value.id
      ? parseInt(addSelected.value.id)
      : null;
    const amount = addAmount.value ? parseFloat(addAmount.value) : null;
    const unit = addUnit.value || null;

    const res = await apiCall({
      action: "add_ingredient",
      ingredient_id: ingredientId,
      name,
      amount,
      unit,
      recipe_id: null,
    });

    if (res.ok) {
      items.value = [
        ...items.value,
        {
          id: res.item_id as number,
          ingredient_id: ingredientId,
          name,
          amount,
          unit,
          store_id: null,
          checked: false,
          recipe_title: null,
          recipe_slug: null,
        },
      ];
      addSelected.value = { id: "", name: "" };
      addName.value = "";
      addAmount.value = "";
      addUnit.value = "";
    }
    adding.value = false;
  }



  function renderItemRow(item: ShoppingItem, showRecipe: boolean) {
    const costInfo = getCost(
      item.ingredient_id,
      item.amount,
      item.unit,
      item.store_id,
    );
    const itemStores = getStoresForItem(item.ingredient_id);
    return (
      <div
        key={item.id}
        class="card flex items-center gap-2 py-2 px-3"
      >
        <div class={CHECK_COL}>
          <input
            type="checkbox"
            checked={item.checked}
            class="size-4 cursor-pointer accent-orange-600"
            onChange={() => toggleChecked(item)}
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium">
            {item.amount != null && (
              <span class="text-orange-600 mr-1">
                {formatAmount(item.amount)}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            )}
            {item.ingredient_id
              ? (
                <a href={`/ingredients/${item.ingredient_id}`} class="link">
                  {item.name}
                </a>
              )
              : item.name}
          </div>
          {showRecipe && item.recipe_title && (
            <div class="text-xs text-stone-400">
              <a href={`/recipes/${item.recipe_slug}`} class="link">
                {item.recipe_title}
              </a>
            </div>
          )}
        </div>
        <div class={STORE_COL}>
          <select
            class="text-xs py-1 px-1 w-full"
            value={item.store_id ?? ""}
            onChange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              updateStore(item, val ? parseInt(val) : null);
            }}
          >
            <option value="">Store...</option>
            {itemStores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div class={PRICE_COL}>
          {costInfo && (
            <span class="text-xs text-stone-500 whitespace-nowrap">
              {getCurrencySymbol(costInfo.currency)}
              {formatCurrency(costInfo.cost)}
            </span>
          )}
        </div>
        <div class={REMOVE_COL}>
          <button
            type="button"
            class="text-stone-400 hover:text-red-500 text-sm cursor-pointer"
            onClick={() => removeItem(item)}
            title="Remove"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  interface MergedItem {
    ids: number[];
    ingredient_id: number | null;
    name: string;
    amount: number | null;
    unit: string | null;
    store_id: number | null;
    recipes: { title: string; slug: string }[];
  }

  function mergeItems(groupItems: ShoppingItem[]): MergedItem[] {
    const merged = new Map<string, MergedItem>();
    const standalone: MergedItem[] = [];

    for (const item of groupItems) {
      const mergeKey = item.ingredient_id != null
        ? `ing:${item.ingredient_id}:${item.unit ?? ""}`
        : null;

      if (mergeKey && merged.has(mergeKey)) {
        const existing = merged.get(mergeKey)!;
        existing.ids.push(item.id);
        if (item.amount != null) {
          existing.amount = (existing.amount ?? 0) + item.amount;
        }
        if (
          item.recipe_title &&
          !existing.recipes.some((r) => r.slug === item.recipe_slug)
        ) {
          existing.recipes.push({
            title: item.recipe_title,
            slug: item.recipe_slug!,
          });
        }
      } else {
        const entry: MergedItem = {
          ids: [item.id],
          ingredient_id: item.ingredient_id,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          store_id: item.store_id,
          recipes: item.recipe_title
            ? [{ title: item.recipe_title, slug: item.recipe_slug! }]
            : [],
        };
        if (mergeKey) {
          merged.set(mergeKey, entry);
        } else {
          standalone.push(entry);
        }
      }
    }

    return [...merged.values(), ...standalone];
  }

  function renderMergedItemRow(item: MergedItem) {
    const costInfo = getCost(
      item.ingredient_id,
      item.amount,
      item.unit,
      item.store_id,
    );
    const itemStores = getStoresForItem(item.ingredient_id);

    return (
      <div
        key={item.ids.join(",")}
        class="card flex items-center gap-2 py-2 px-3"
      >
        <div class={CHECK_COL}>
          <input
            type="checkbox"
            class="size-4 cursor-pointer accent-orange-600"
            onChange={() => {
              for (const id of item.ids) {
                const found = items.value.find((i) => i.id === id);
                if (found) toggleChecked(found);
              }
            }}
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium">
            {item.amount != null && (
              <span class="text-orange-600 mr-1">
                {formatAmount(item.amount)}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            )}
            {item.ingredient_id
              ? (
                <a href={`/ingredients/${item.ingredient_id}`} class="link">
                  {item.name}
                </a>
              )
              : item.name}
          </div>
          {item.recipes.length > 0 && (
            <div class="text-xs text-stone-400">
              {item.recipes.map((r, i) => (
                <span key={r.slug}>
                  {i > 0 && ", "}
                  <a href={`/recipes/${r.slug}`} class="link">{r.title}</a>
                </span>
              ))}
            </div>
          )}
        </div>
        <div class={STORE_COL}>
          <select
            class="text-xs py-1 px-1 w-full"
            value={item.store_id ?? ""}
            onChange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              const storeId = val ? parseInt(val) : null;
              for (const id of item.ids) {
                const found = items.value.find((i) => i.id === id);
                if (found) updateStore(found, storeId);
              }
            }}
          >
            <option value="">Store...</option>
            {itemStores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div class={PRICE_COL}>
          {costInfo && (
            <span class="text-xs text-stone-500 whitespace-nowrap">
              {getCurrencySymbol(costInfo.currency)}
              {formatCurrency(costInfo.cost)}
            </span>
          )}
        </div>
        <div class={REMOVE_COL}>
          <button
            type="button"
            class="text-stone-400 hover:text-red-500 text-sm cursor-pointer"
            onClick={() => {
              for (const id of item.ids) {
                const found = items.value.find((i) => i.id === id);
                if (found) removeItem(found);
              }
            }}
            title="Remove"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  function renderGroupedByRecipe(unchecked: ShoppingItem[]) {
    const byRecipe = new Map<string, ShoppingItem[]>();
    for (const item of unchecked) {
      const key = item.recipe_slug ?? "__none__";
      if (!byRecipe.has(key)) byRecipe.set(key, []);
      byRecipe.get(key)!.push(item);
    }

    return [...byRecipe.entries()].map(([key, groupItems]) => (
      <div key={key}>
        {key !== "__none__" && groupItems[0].recipe_title && (
          <h3 class="text-sm font-semibold text-stone-500 mb-1">
            <a
              href={`/recipes/${groupItems[0].recipe_slug}`}
              class="link"
            >
              {groupItems[0].recipe_title}
            </a>
          </h3>
        )}
        <div class="space-y-1">
          {groupItems.map((item) => renderItemRow(item, false))}
        </div>
      </div>
    ));
  }

  function renderGroupedByStore(unchecked: ShoppingItem[]) {
    const storeMap = new Map<number | null, ShoppingItem[]>();
    for (const item of unchecked) {
      const key = item.store_id;
      if (!storeMap.has(key)) storeMap.set(key, []);
      storeMap.get(key)!.push(item);
    }

    const storeIndex = new Map(stores.map((s) => [s.id, s]));
    const entries = [...storeMap.entries()].sort((a, b) => {
      if (a[0] == null && b[0] == null) return 0;
      if (a[0] == null) return 1;
      if (b[0] == null) return -1;
      const nameA = storeIndex.get(a[0])?.name ?? "";
      const nameB = storeIndex.get(b[0])?.name ?? "";
      return nameA.localeCompare(nameB);
    });

    return entries.map(([storeId, groupItems]) => {
      const store = storeId != null ? storeIndex.get(storeId) : null;
      const mergedItems = mergeItems(groupItems);

      let groupCost = 0;
      let groupCurrency = "EUR";
      let hasGroupPrice = false;
      for (const mi of mergedItems) {
        const info = getCost(mi.ingredient_id, mi.amount, mi.unit, mi.store_id);
        if (info) {
          groupCost += info.cost;
          groupCurrency = info.currency;
          hasGroupPrice = true;
        }
      }

      const allIds = mergedItems.flatMap((m) => m.ids);
      return (
        <div key={storeId ?? "__none__"}>
          <div class="flex items-center gap-2 mb-1 px-3">
            <div class={CHECK_COL}>
              <input
                type="checkbox"
                class="size-3.5 cursor-pointer accent-orange-600"
                title="Check all in this store"
                onChange={() => {
                  for (const id of allIds) {
                    const found = items.value.find((i) => i.id === id);
                    if (found && !found.checked) toggleChecked(found);
                  }
                }}
              />
            </div>
            <span class="flex-1 text-sm font-semibold text-stone-500">
              {store ? store.name : "No store"}
            </span>
            <div class={STORE_COL} />
            <div class={PRICE_COL}>
              {hasGroupPrice && (
                <span class="text-xs font-semibold text-orange-600 whitespace-nowrap">
                  {getCurrencySymbol(groupCurrency)}
                  {formatCurrency(groupCost)}
                </span>
              )}
            </div>
            <div class={REMOVE_COL} />
          </div>
          <div class="space-y-1">
            {mergedItems.map((mi) => renderMergedItemRow(mi))}
          </div>
        </div>
      );
    });
  }

  const unchecked = items.value.filter((i) => !i.checked);
  const checked = items.value.filter((i) => i.checked);

  let totalCost = 0;
  let totalCurrency = "EUR";
  let hasAnyPrice = false;
  for (const item of unchecked) {
    const info = getCost(
      item.ingredient_id,
      item.amount,
      item.unit,
      item.store_id,
    );
    if (info) {
      totalCost += info.cost;
      totalCurrency = info.currency;
      hasAnyPrice = true;
    }
  }

  return (
    <div>
      <div class="card mb-4">
        <div class="flex gap-2 items-end">
          <div class="flex-1 min-w-0">
            <label class="block text-xs font-medium mb-1">Item</label>
            <SearchSelect
              value={addSelected.value}
              options={addOptions}
              placeholder="Search or type a name..."
              onSelect={(o) => {
                addSelected.value = { id: o.id, name: o.name };
                addName.value = o.name;
                const ing = ingredients.find((i) => i.id === o.id);
                if (ing?.unit) addUnit.value = ing.unit;
              }}
              onClear={() => {
                addSelected.value = { id: "", name: "" };
                addName.value = "";
              }}
              onChange={(text) => {
                addName.value = text;
              }}
            />
          </div>
          <div class="w-20">
            <label class="block text-xs font-medium mb-1">Qty</label>
            <input
              type="number"
              min="0"
              step="any"
              value={addAmount}
              class="w-full"
              onInput={(e) => {
                addAmount.value = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <div class="w-24">
            <label class="block text-xs font-medium mb-1">Unit</label>
            <select
              value={addUnit}
              class="w-full"
              onChange={(e) => {
                addUnit.value = (e.target as HTMLSelectElement).value;
              }}
            >
              <option value="">—</option>
              {UNIT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.units.map((u) => (
                    <option key={u.name} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            disabled={adding.value ||
              (!addSelected.value.id && !addName.value.trim())}
            onClick={addItem}
          >
            Add
          </button>
        </div>
      </div>

      {items.value.length === 0
        ? (
          <div class="card text-center py-8">
            <p class="text-stone-500">Your shopping list is empty.</p>
          </div>
        )
        : (
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex gap-1">
                <button
                  type="button"
                  class={`text-xs px-3 py-1 border-2 cursor-pointer ${
                    viewMode.value === "recipe"
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-stone-300 dark:border-stone-700 text-stone-500"
                  }`}
                  onClick={() => setViewMode("recipe")}
                >
                  By recipe
                </button>
                <button
                  type="button"
                  class={`text-xs px-3 py-1 border-2 cursor-pointer ${
                    viewMode.value === "store"
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-stone-300 dark:border-stone-700 text-stone-500"
                  }`}
                  onClick={() => setViewMode("store")}
                >
                  By store
                </button>
              </div>
              {hasAnyPrice && (
                <div class="text-right">
                  <span class="text-sm text-stone-500 mr-1">Total:</span>
                  <span class="font-bold text-orange-600">
                    {getCurrencySymbol(totalCurrency)}
                    {formatCurrency(totalCost)}
                  </span>
                </div>
              )}
            </div>

            {viewMode.value === "recipe"
              ? renderGroupedByRecipe(unchecked)
              : renderGroupedByStore(unchecked)}

            {checked.length > 0 && (
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-sm font-semibold text-stone-400">
                    Checked ({checked.length})
                  </h3>
                  <button
                    type="button"
                    class="text-xs text-red-500 hover:underline cursor-pointer"
                    onClick={clearChecked}
                  >
                    Clear checked
                  </button>
                </div>
                <div class="space-y-1 opacity-50">
                  {checked.map((item) => (
                    <div
                      key={item.id}
                      class="card flex items-center gap-2 py-2 px-3"
                    >
                      <div class={CHECK_COL}>
                        <input
                          type="checkbox"
                          checked
                          class="size-4 cursor-pointer accent-orange-600"
                          onChange={() => toggleChecked(item)}
                        />
                      </div>
                      <span class="flex-1 text-sm line-through">
                        {item.amount != null && (
                          <span class="mr-1">
                            {formatAmount(item.amount)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        )}
                        {item.name}
                      </span>
                      <div class={STORE_COL} />
                      <div class={PRICE_COL} />
                      <div class={REMOVE_COL}>
                        <button
                          type="button"
                          class="text-stone-400 hover:text-red-500 text-sm cursor-pointer"
                          onClick={() => removeItem(item)}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {items.value.length > 0 && (
              <div class="text-right">
                <button
                  type="button"
                  class="text-xs text-stone-400 hover:text-red-500 cursor-pointer"
                  onClick={clearAll}
                >
                  Clear entire list
                </button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
