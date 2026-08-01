import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import ConfirmButton from "./ConfirmButton.tsx";
import { computeIngredientCost } from "../lib/unit-convert.ts";
import { getCurrencySymbol } from "../lib/currencies.ts";
import { formatAmount, formatCurrency } from "../lib/format.ts";
import SearchSelect from "./SearchSelect.tsx";
import type { SearchSelectOption } from "./SearchSelect.tsx";
import type { ShoppingLine } from "../lib/shopping-list.ts";
import { UNIT_GROUPS } from "../lib/units.ts";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

interface Store {
  id: string;
  name: string;
  currency: string;
}

interface PriceInfo {
  store_id: string;
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
  initialLines: ShoppingLine[];
  stores: Store[];
  pricesMap: Record<string, PriceInfo[]>;
  initialViewMode: ViewMode;
  ingredients: IngredientOption[];
  initialShareToken?: string | null;
}

type ViewMode = "source" | "store";

const STORE_COL = "w-28 shrink-0";
const PRICE_COL = "w-16 shrink-0 text-right";
const REMOVE_COL = "w-5 shrink-0 text-center";
const CHECK_COL = "w-5 shrink-0";

export default function ShoppingListView(
  {
    initialLines,
    stores,
    pricesMap,
    initialViewMode,
    ingredients,
    initialShareToken,
  }: Props,
) {
  const lines = useSignal<ShoppingLine[]>(initialLines);
  const viewMode = useSignal<ViewMode>(initialViewMode);
  const shareToken = useSignal<string | null>(initialShareToken ?? null);
  const shareCopied = useSignal(false);
  const addSelected = useSignal<{ id: string; name: string }>({
    id: "",
    name: "",
  });
  const addName = useSignal("");
  const addAmount = useSignal("");
  const addUnit = useSignal("");
  const adding = useSignal(false);
  const busy = useSignal<string | null>(null);

  /**
   * Every mutation returns the recomputed projection, so the client never
   * recalculates "what's left to buy" itself — buying one thing can change
   * several lines at once.
   */
  async function apiCall(body: Record<string, unknown>) {
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (Array.isArray(data.lines)) {
      lines.value = data.lines as ShoppingLine[];
      syncNavBadge(lines.value);
    }
    return data;
  }

  /**
   * The nav badge is server-rendered, so without this it kept the count the
   * page loaded with until the next navigation — reading "12" beside eleven
   * remaining rows.
   */
  function syncNavBadge(current: ShoppingLine[]) {
    if (typeof document === "undefined") return;
    const count = current.filter((l) => !l.purchase).length;
    for (const el of document.querySelectorAll("[data-shopping-badge]")) {
      el.textContent = String(count);
      el.classList.toggle("hidden", count === 0);
    }
  }

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
    document.cookie = `sl_view=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  function getCost(
    line: ShoppingLine,
  ): { cost: number; currency: string } | null {
    const amount = line.purchase ? line.purchase.amount : line.needed;
    if (line.ingredient_id == null || amount == null) return null;
    const prices = pricesMap[String(line.ingredient_id)];
    if (!prices || prices.length === 0) return null;

    const price = line.store_id
      ? prices.find((p) => p.store_id === line.store_id)
      : prices[0];
    if (!price) return null;

    const cost = computeIngredientCost(
      amount,
      (line.purchase ? line.purchase.unit : line.unit) ?? "",
      price.price,
      price.amount,
      price.unit,
      price.density,
    );
    if (cost == null) return null;
    return { cost, currency: price.currency };
  }

  function getStoresForLine(ingredientId: string | null): Store[] {
    if (ingredientId == null) return [];
    const prices = pricesMap[String(ingredientId)];
    if (!prices || prices.length === 0) return [];
    const withPrice = new Set(prices.map((p) => p.store_id));
    return stores.filter((s) => withPrice.has(s.id));
  }

  async function toggleBought(line: ShoppingLine) {
    busy.value = line.key;
    if (line.purchase) {
      await apiCall({ action: "unbuy_line", match_key: line.key });
    } else {
      await apiCall({
        action: "buy_line",
        match_key: line.key,
        ingredient_id: line.ingredient_id,
        name: line.name,
        amount: line.needed,
        unit: line.unit,
        store_id: line.store_id,
      });
    }
    busy.value = null;
  }

  async function updateStore(line: ShoppingLine, storeId: string | null) {
    await apiCall({
      action: "set_store",
      match_key: line.key,
      ingredient_id: line.ingredient_id,
      store_id: storeId,
    });
  }

  async function removeLine(line: ShoppingLine) {
    await apiCall({ action: "remove_line", match_key: line.key });
  }

  async function addDemand() {
    const name = addSelected.value.id
      ? addSelected.value.name
      : addName.value.trim();
    if (!name) return;

    adding.value = true;
    await apiCall({
      action: "add_demand",
      ingredient_id: addSelected.value.id || undefined,
      name,
      amount: addAmount.value ? parseFloat(addAmount.value) : null,
      unit: addUnit.value || null,
    });
    addSelected.value = { id: "", name: "" };
    addName.value = "";
    addAmount.value = "";
    addUnit.value = "";
    adding.value = false;
  }

  const addOptions: SearchSelectOption[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    detail: i.unit,
  }));

  function renderLine(line: ShoppingLine, showSources: boolean) {
    const costInfo = getCost(line);
    const lineStores = getStoresForLine(line.ingredient_id);
    const bought = line.purchase != null;
    const amount = bought ? line.purchase?.amount : line.needed;
    const unit = (bought ? line.purchase?.unit : line.unit) ?? "";

    return (
      <div
        key={line.key}
        class={`flex items-center gap-2 py-1.5 px-2 border-b border-stone-200 dark:border-stone-800 last:border-b-0 ${
          bought ? "opacity-50" : ""
        }`}
      >
        <div class={CHECK_COL}>
          <input
            type="checkbox"
            checked={bought}
            disabled={busy.value === line.key}
            class="size-4 cursor-pointer accent-orange-600"
            // Ticking a line is a purchase, not just a tick: it books the stock
            // into the pantry, which later gets deducted when you cook. Say so.
            aria-label={bought
              ? `Un-buy ${line.name} — removes it from the pantry again`
              : `Bought ${line.name} — adds it to your pantry`}
            title={bought
              ? "Bought. Un-ticking takes it back out of the pantry."
              : "Tick when you've bought it — it goes into your pantry"}
            onChange={() => toggleBought(line)}
          />
        </div>
        <div class="flex-1 min-w-0">
          <div class={`text-sm font-medium ${bought ? "line-through" : ""}`}>
            {amount != null && (
              <span class={bought ? "mr-1" : "text-orange-600 mr-1"}>
                {formatAmount(amount)}
                {unit ? ` ${unit}` : ""}
              </span>
            )}
            {line.ingredient_id
              ? (
                <a href={`/ingredients/${line.ingredient_id}`} class="link">
                  {line.name}
                </a>
              )
              : line.name}
          </div>
          {
            /* One meta line rather than a stack — this list is read one-handed
              in a shop, so every row that grows pushes another off screen. */
          }
          {(() => {
            const notes: ComponentChildren[] = [];
            if (!bought && line.have > 0) {
              notes.push(
                <span class="text-stone-400">
                  {formatAmount(line.have)}
                  {line.unit ? ` ${line.unit}` : ""} in pantry
                </span>,
              );
            }
            if (!bought && line.quantityUnknown && line.have === 0) {
              notes.push(
                <span class="text-amber-600 dark:text-amber-400">
                  In the pantry, amount not tracked
                </span>,
              );
            }
            if (!bought && line.unconvertible) {
              notes.push(
                <span class="text-amber-600 dark:text-amber-400">
                  Units don't match — check this one yourself
                </span>,
              );
            }
            if (showSources && line.sources.length > 0) {
              notes.push(
                <span class="text-stone-400">
                  {line.sources.map((s, i) => (
                    <span key={`${s.kind}-${s.id}`}>
                      {i > 0 && ", "}
                      {s.kind === "plan" && s.slug
                        ? (
                          <a href={`/recipes/${s.slug}`} class="link">
                            {s.label}
                          </a>
                        )
                        : s.label}
                    </span>
                  ))}
                </span>,
              );
            }
            if (notes.length === 0) return null;
            return (
              <div class="text-xs truncate">
                {notes.map((n, i) => (
                  <span key={i}>
                    {i > 0 && <span class="text-stone-400 mx-1">·</span>}
                    {n}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
        {showStoreCol && (
          <div class={STORE_COL}>
            {lineStores.length > 0 && (
              <Select
                class="py-1 px-1 w-full"
                size="xs"
                aria-label={`Store for ${line.name}`}
                value={line.store_id ?? ""}
                onValueChange={(v) => updateStore(line, v || null)}
              >
                <option value="">Store...</option>
                {lineStores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            )}
          </div>
        )}
        {showPriceCol && (
          <div class={PRICE_COL}>
            {costInfo && (
              <span class="text-xs text-stone-500 whitespace-nowrap">
                {getCurrencySymbol(costInfo.currency)}
                {formatCurrency(costInfo.cost)}
              </span>
            )}
          </div>
        )}
        <div class={REMOVE_COL}>
          <button
            type="button"
            class="text-stone-400 hover:text-red-500 text-sm cursor-pointer"
            onClick={() => removeLine(line)}
            title="Remove"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  function renderGroupedBySource(outstanding: ShoppingLine[]) {
    // A line can serve several meals; it is filed under the first one that
    // asked for it and lists the rest inline.
    const groups = new Map<
      string,
      { label: string; slug: string | null; lines: ShoppingLine[] }
    >();
    for (const line of outstanding) {
      const primary = line.sources[0];
      // Manual demands added from a recipe page carry that recipe's name as
      // their label. Filing every manual row under one "Added by hand" heading
      // threw that away — in the view whose whole point is grouping by meal.
      const key = primary?.kind === "plan"
        ? `plan:${primary.id}`
        : primary?.label
        ? `manual:${primary.label}`
        : "__manual__";
      let group = groups.get(key);
      if (!group) {
        group = {
          label: primary?.label ?? "Added by hand",
          slug: primary?.kind === "plan" ? primary.slug ?? null : null,
          lines: [],
        };
        groups.set(key, group);
      }
      group.lines.push(line);
    }

    return [...groups.entries()].map(([key, group]) => (
      <div key={key}>
        <h3 class="text-sm font-semibold text-stone-500 mb-1">
          {group.slug
            ? <a href={`/recipes/${group.slug}`} class="link">{group.label}</a>
            : group.label}
        </h3>
        <div class="card p-0">
          {group.lines.map((line) => renderLine(line, false))}
        </div>
      </div>
    ));
  }

  function renderGroupedByStore(outstanding: ShoppingLine[]) {
    const storeMap = new Map<string | null, ShoppingLine[]>();
    for (const line of outstanding) {
      const key = line.store_id;
      if (!storeMap.has(key)) storeMap.set(key, []);
      storeMap.get(key)!.push(line);
    }

    const storeIndex = new Map(stores.map((s) => [s.id, s]));
    const entries = [...storeMap.entries()].sort((a, b) => {
      if (a[0] == null && b[0] == null) return 0;
      if (a[0] == null) return 1;
      if (b[0] == null) return -1;
      return (storeIndex.get(a[0])?.name ?? "").localeCompare(
        storeIndex.get(b[0])?.name ?? "",
      );
    });

    return entries.map(([storeId, groupLines]) => {
      const store = storeId != null ? storeIndex.get(storeId) : null;

      let groupCost = 0;
      let groupCurrency = "EUR";
      let hasGroupPrice = false;
      for (const line of groupLines) {
        const info = getCost(line);
        if (info) {
          groupCost += info.cost;
          groupCurrency = info.currency;
          hasGroupPrice = true;
        }
      }

      return (
        <div key={storeId ?? "__none__"}>
          <div class="flex items-center gap-2 mb-1 px-2">
            <div class={CHECK_COL}>
              <input
                type="checkbox"
                class="size-3.5 cursor-pointer accent-orange-600"
                aria-label={`Buy everything from ${
                  store ? store.name : "no store"
                } — adds it all to your pantry`}
                title="Check everything from this store"
                onChange={async () => {
                  for (const line of groupLines) {
                    if (!line.purchase) await toggleBought(line);
                  }
                }}
              />
            </div>
            <span class="flex-1 text-sm font-semibold text-stone-500">
              {store ? store.name : "No store"}
            </span>
            {showStoreCol && <div class={STORE_COL} />}
            {showPriceCol && (
              <div class={PRICE_COL}>
                {hasGroupPrice && (
                  <span class="text-xs font-semibold text-orange-600 whitespace-nowrap">
                    {getCurrencySymbol(groupCurrency)}
                    {formatCurrency(groupCost)}
                  </span>
                )}
              </div>
            )}
            <div class={REMOVE_COL} />
          </div>
          <div class="card p-0">
            {groupLines.map((line) => renderLine(line, true))}
          </div>
        </div>
      );
    });
  }

  const outstanding = lines.value.filter((l) => !l.purchase);
  const bought = lines.value.filter((l) => l.purchase);

  /**
   * Store and price columns only earn their width once the household has
   * somewhere to shop. With no stores they were an empty `<select>` on every
   * row — twelve inert dropdowns on the app's most density-sensitive screen.
   */
  const showStoreCol = stores.length > 0 &&
    lines.value.some((l) => getStoresForLine(l.ingredient_id).length > 0);
  const showPriceCol = lines.value.some((l) => getCost(l) != null);

  let totalCost = 0;
  let totalCurrency = "EUR";
  let hasAnyPrice = false;
  for (const line of outstanding) {
    const info = getCost(line);
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
            <Input
              type="number"
              min="0"
              step="any"
              value={addAmount}
              class="w-full"
              onValueChange={(v) => addAmount.value = v}
            />
          </div>
          <div class="w-24">
            <label class="block text-xs font-medium mb-1">Unit</label>
            <Select
              value={addUnit}
              class="w-full"
              onValueChange={(v) => addUnit.value = v}
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
            </Select>
          </div>
          <Button
            type="button"
            disabled={adding.value ||
              (!addSelected.value.id && !addName.value.trim())}
            onClick={addDemand}
          >
            Add
          </Button>
        </div>
      </div>

      {lines.value.length === 0
        ? (
          <div class="card text-center py-8">
            <p class="text-stone-500">
              Nothing to buy. Plan a meal and whatever the pantry can't cover
              shows up here.
            </p>
            <a href="/plan" class="link text-sm">Open the meal plan</a>
          </div>
        )
        : (
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex gap-1">
                <button
                  type="button"
                  class={`text-xs px-3 py-1 border-2 cursor-pointer ${
                    viewMode.value === "source"
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-stone-300 dark:border-stone-700 text-stone-500"
                  }`}
                  onClick={() => setViewMode("source")}
                >
                  By meal
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
                <span class="text-xs text-stone-500 self-center ml-2">
                  {bought.length} of {lines.value.length} bought
                </span>
              </div>
              <div class="flex items-center gap-2">
                {hasAnyPrice && (
                  <div class="text-right mr-2">
                    <span class="text-sm text-stone-500 mr-1">Total:</span>
                    <span class="font-bold text-orange-600">
                      {getCurrencySymbol(totalCurrency)}
                      {formatCurrency(totalCost)}
                    </span>
                  </div>
                )}
                {shareToken.value
                  ? (
                    <div class="flex gap-1">
                      <button
                        type="button"
                        class="text-xs px-2 py-1 border-2 border-stone-300 dark:border-stone-700 text-stone-500 cursor-pointer hover:border-orange-600"
                        onClick={() => {
                          const url =
                            `${globalThis.location.origin}/shopping-list/shared/${shareToken.value}`;
                          navigator.clipboard.writeText(url).then(() => {
                            shareCopied.value = true;
                            setTimeout(() => shareCopied.value = false, 2000);
                          });
                        }}
                      >
                        {shareCopied.value ? "Copied!" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        class="text-xs px-2 py-1 border-2 border-stone-300 dark:border-stone-700 text-red-500 cursor-pointer hover:border-red-500"
                        onClick={async () => {
                          await apiCall({ action: "revoke_share_link" });
                          shareToken.value = null;
                        }}
                        title="Revoke shared link"
                      >
                        Unshare
                      </button>
                    </div>
                  )
                  : (
                    <button
                      type="button"
                      class="text-xs px-2 py-1 border-2 border-stone-300 dark:border-stone-700 text-stone-500 cursor-pointer hover:border-orange-600"
                      onClick={async () => {
                        const res = await apiCall({
                          action: "generate_share_link",
                        });
                        if (res.share_token) shareToken.value = res.share_token;
                      }}
                    >
                      Share
                    </button>
                  )}
              </div>
            </div>

            {viewMode.value === "source"
              ? renderGroupedBySource(outstanding)
              : renderGroupedByStore(outstanding)}

            {bought.length > 0 && (
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-sm font-semibold text-stone-400">
                    Bought ({bought.length})
                  </h3>
                  <button
                    type="button"
                    class="text-xs text-red-500 hover:underline cursor-pointer"
                    onClick={() => apiCall({ action: "clear_bought" })}
                    title="Clear the ticked-off lines. The stock stays in your pantry."
                  >
                    Clear bought
                  </button>
                </div>
                <div class="space-y-1">
                  {bought.map((line) => renderLine(line, false))}
                </div>
              </div>
            )}

            <div class="text-right">
              <ConfirmButton
                variant="danger-ghost"
                size="xs"
                class="text-xs"
                message={"Clear the entire shopping list?\n\n" +
                  "This deletes every item you added by hand, and stops your " +
                  "planned meals from feeding the list.\n\nThis can't be undone."}
                onClick={() => apiCall({ action: "clear_all" })}
              >
                Clear entire list
              </ConfirmButton>
            </div>
          </div>
        )}
    </div>
  );
}
