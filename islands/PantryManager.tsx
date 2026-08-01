import { useComputed, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import SearchSelect from "./SearchSelect.tsx";
import type { SearchSelectOption } from "./SearchSelect.tsx";
import ScanView from "./ScanView.tsx";
import { UNIT_GROUPS } from "../lib/units.ts";
import { findDuplicates } from "../lib/inventory.ts";
import { formatInputValue } from "../lib/format.ts";
import { IconTrash } from "@tabler/icons-preact";
import { IconAlertTriangle } from "@tabler/icons-preact";
import { IconScan } from "@tabler/icons-preact";
import { IconArrowMerge } from "@tabler/icons-preact";
import GenerateRecipe from "./GenerateRecipe.tsx";
import { Button } from "../components/Button.tsx";
import { Input, InputBar } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

interface PantryItem {
  id: string;
  ingredient_id?: string;
  name: string;
  amount?: number;
  unit?: string;
  expires_at?: string;
  /** Always on hand — never counted as missing, never deducted. */
  staple?: boolean;
}

const WARN_DAYS = 3;

function expiryStatus(
  expiresAt: string | undefined,
): "ok" | "soon" | "expired" | null {
  if (!expiresAt) return null;
  const diff = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / 86_400_000,
  );
  if (diff < 0) return "expired";
  if (diff <= WARN_DAYS) return "soon";
  return "ok";
}

interface PantryIngredient {
  id: string;
  name: string;
  unit?: string;
}

interface PantryStore {
  id: string;
  name: string;
}

interface PantryManagerProps {
  householdId: string;
  initialItems: PantryItem[];
  ingredients: PantryIngredient[];
  stores: PantryStore[];
}

export default function PantryManager(
  { householdId, initialItems, ingredients, stores }: PantryManagerProps,
) {
  const items = useSignal<PantryItem[]>(initialItems);
  const selectedIngredient = useSignal<{ id: string; name: string }>({
    id: "",
    name: "",
  });
  const newName = useSignal("");
  const newAmount = useSignal("");
  const newUnit = useSignal("");
  const newExpiresAt = useSignal("");
  const saving = useSignal(false);
  const scanning = useSignal(false);

  // Auto-open scanner when ?scan=1 is in the URL
  useEffect(() => {
    if (typeof document !== "undefined") {
      const params = new URLSearchParams(globalThis.location.search);
      if (params.get("scan") === "1") {
        scanning.value = true;
        // Clean up the URL
        params.delete("scan");
        const clean = params.toString();
        const url = globalThis.location.pathname + (clean ? `?${clean}` : "");
        globalThis.history.replaceState(null, "", url);
      }
    }
  }, []);

  // ID of the item currently showing its merge panel (null = none open)
  const mergingItemId = useSignal<string | null>(null);
  const search = useSignal("");

  const expiringSoonCount = useComputed(() =>
    items.value.filter((i) => {
      const s = expiryStatus(i.expires_at);
      return s === "soon" || s === "expired";
    }).length
  );

  const filteredItems = useComputed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return items.value;
    return items.value.filter((i) => i.name.toLowerCase().includes(q));
  });

  const options: SearchSelectOption[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    detail: i.unit,
  }));

  async function addItem() {
    const name = selectedIngredient.value.id
      ? selectedIngredient.value.name
      : newName.value.trim();
    if (!name) return;

    saving.value = true;
    const res = await fetch(`/api/pantry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        household_id: householdId,
        ingredient_id: selectedIngredient.value.id || null,
        name,
        amount: newAmount.value ? parseFloat(newAmount.value) : null,
        unit: newUnit.value || null,
        expires_at: newExpiresAt.value || null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      items.value = [
        ...items.value,
        {
          id: data.id,
          ingredient_id: selectedIngredient.value.id || undefined,
          name,
          amount: newAmount.value ? parseFloat(newAmount.value) : undefined,
          unit: newUnit.value || undefined,
          expires_at: newExpiresAt.value || undefined,
        },
      ].sort((a, b) => a.name.localeCompare(b.name));

      selectedIngredient.value = { id: "", name: "" };
      newName.value = "";
      newAmount.value = "";
      newUnit.value = "";
      newExpiresAt.value = "";
    }
    saving.value = false;
  }

  async function updateItem(
    item: PantryItem,
    amount: number | null,
    unit: string | null,
    expiresAt?: string | null,
  ) {
    const newExpiresAt = expiresAt !== undefined
      ? expiresAt
      : item.expires_at ?? null;
    await fetch(`/api/pantry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        item_id: item.id,
        household_id: householdId,
        amount,
        unit,
        expires_at: newExpiresAt,
      }),
    });
    items.value = items.value.map((i) =>
      i.id === item.id
        ? {
          ...i,
          amount: amount ?? undefined,
          unit: unit ?? undefined,
          expires_at: newExpiresAt ?? undefined,
        }
        : i
    );
  }

  /**
   * Duplicates of an item, by the same identity rule the recipe view and the
   * shopping list use — a linked ingredient first, the normalized name second.
   */
  function getSiblings(item: PantryItem): PantryItem[] {
    return findDuplicates(item, items.value);
  }

  async function setStaple(item: PantryItem, staple: boolean) {
    items.value = items.value.map((i) =>
      i.id === item.id ? { ...i, staple } : i
    );
    await fetch(`/api/pantry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_staple",
        item_id: item.id,
        staple,
      }),
    });
  }

  async function mergeItems(targetId: string, sourceIds: string[]) {
    const res = await fetch(`/api/pantry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        household_id: householdId,
        target_id: targetId,
        source_ids: sourceIds,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      items.value = items.value
        .filter((i) => !sourceIds.includes(i.id))
        .map((i) =>
          i.id === targetId
            ? {
              ...i,
              amount: data.amount ?? undefined,
              expires_at: data.expires_at ?? undefined,
            }
            : i
        );
      mergingItemId.value = null;
    }
  }

  async function removeItem(itemId: string) {
    await fetch(`/api/pantry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove",
        item_id: itemId,
        household_id: householdId,
      }),
    });
    items.value = items.value.filter((i) => i.id !== itemId);
  }

  return (
    <div class="grid gap-6 lg:grid-cols-3">
      {scanning.value && (
        <ScanView
          mode="modal"
          householdId={householdId}
          ingredients={ingredients}
          stores={stores}
          onAdd={(result) => {
            items.value = [
              ...items.value,
              {
                id: result.id,
                ingredient_id: result.ingredient_id ?? undefined,
                name: result.name,
                amount: result.amount ?? undefined,
                unit: result.unit ?? undefined,
                expires_at: result.expires_at ?? undefined,
              },
            ].sort((a, b) => a.name.localeCompare(b.name));
            scanning.value = false;
          }}
          onClose={() => {
            scanning.value = false;
          }}
        />
      )}

      <div class="lg:col-span-1 space-y-4">
        <div>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">Add Item</h2>
            <Button
              type="button"
              size="sm"
              icon={IconScan}
              onClick={() => {
                scanning.value = true;
              }}
            >
              Scan
            </Button>
          </div>
          <div class="card space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1">Ingredient</label>
              <SearchSelect
                value={selectedIngredient.value}
                options={options}
                placeholder="Search ingredients..."
                onSelect={(o) => {
                  selectedIngredient.value = { id: o.id, name: o.name };
                  newName.value = o.name;
                  const ing = ingredients.find((i) => i.id === o.id);
                  if (ing?.unit) newUnit.value = ing.unit;
                }}
                onClear={() => {
                  selectedIngredient.value = { id: "", name: "" };
                  newName.value = "";
                }}
                onChange={(text) => {
                  newName.value = text;
                }}
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">
                Amount <span class="text-stone-400">(optional)</span>
              </label>
              <InputBar>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={newAmount}
                  placeholder="e.g. 500"
                  onValueChange={(v) => newAmount.value = v}
                />
                <Select
                  value={newUnit}
                  class="w-24"
                  onValueChange={(v) => newUnit.value = v}
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
              </InputBar>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">
                Best before <span class="text-stone-400">(optional)</span>
              </label>
              <Input
                type="date"
                value={newExpiresAt}
                class="w-full"
                onValueChange={(v) => newExpiresAt.value = v}
              />
            </div>
            <Button
              type="button"
              disabled={saving.value ||
                (!selectedIngredient.value.id && !newName.value.trim())}
              onClick={addItem}
            >
              {saving.value ? "Adding..." : "Add to Pantry"}
            </Button>
          </div>
        </div>

        {items.value.length > 0 && (
          <div class="mt-8">
            <GenerateRecipe />
          </div>
        )}
      </div>

      <div class="lg:col-span-2">
        <div class="flex items-center gap-3 mb-3">
          <h2 class="text-lg font-semibold shrink-0">
            In Stock ({items.value.length})
          </h2>
          {items.value.length > 0 && (
            <Input
              type="search"
              placeholder="Search pantry..."
              value={search}
              class="flex-1"
              onValueChange={(v) => search.value = v}
            />
          )}
        </div>
        {expiringSoonCount.value > 0 && (
          <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm mb-3">
            <IconAlertTriangle class="size-4 shrink-0" />
            <span>
              {expiringSoonCount.value}{" "}
              {expiringSoonCount.value === 1 ? "item needs" : "items need"}{" "}
              to be used soon
            </span>
          </div>
        )}
        {items.value.length === 0
          ? (
            <p class="text-stone-500">
              Your pantry is empty. Add ingredients you have on hand.
            </p>
          )
          : filteredItems.value.length === 0
          ? (
            <p class="text-stone-500">
              No items match "{search.value}".
            </p>
          )
          : (
            <div class="space-y-1">
              {filteredItems.value.map((item) => {
                const status = expiryStatus(item.expires_at);
                const siblings = getSiblings(item);
                const isMerging = mergingItemId.value === item.id;
                return (
                  <div key={item.id}>
                    <div
                      class={`card flex flex-wrap items-center gap-2 py-2${
                        status === "expired"
                          ? " border-red-300 dark:border-red-700"
                          : status === "soon"
                          ? " border-amber-300 dark:border-amber-700"
                          : ""
                      }`}
                    >
                      <div class="flex-1 min-w-0">
                        {item.ingredient_id
                          ? (
                            <a
                              href={`/ingredients/${item.ingredient_id}`}
                              class="link font-medium text-sm"
                            >
                              {item.name}
                            </a>
                          )
                          : (
                            <span class="font-medium text-sm">{item.name}</span>
                          )}
                        {status === "expired" && (
                          <span class="ml-2 text-xs text-red-600 dark:text-red-400">
                            Expired
                          </span>
                        )}
                        {status === "soon" && (
                          <span class="ml-2 text-xs text-amber-600 dark:text-amber-400">
                            Use soon
                          </span>
                        )}
                        {item.staple && (
                          <span class="ml-2 text-xs text-stone-400">
                            Staple
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        class={`p-1 cursor-pointer text-xs ${
                          item.staple
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-stone-300 dark:text-stone-600 hover:text-stone-500"
                        }`}
                        title={item.staple
                          ? "Staple: always counted as available. Click to track its amount instead."
                          : "Mark as a staple — salt, oil, water and the like, so recipes stop reporting them as missing."}
                        onClick={() => setStaple(item, !item.staple)}
                      >
                        &#x2605;
                      </button>
                      {siblings.length > 0 && (
                        <button
                          type="button"
                          class={`p-1 cursor-pointer ${
                            isMerging
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                          }`}
                          title="Merge duplicates into this item"
                          onClick={() => {
                            mergingItemId.value = isMerging ? null : item.id;
                          }}
                        >
                          <IconArrowMerge class="size-4" />
                        </button>
                      )}
                      <InputBar>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={formatInputValue(item.amount)}
                          placeholder="Qty"
                          class="w-20"
                          onBlur={(e) => {
                            const val = (e.currentTarget as HTMLInputElement)
                              .value;
                            const amount = val ? parseFloat(val) : null;
                            if (amount !== (item.amount ?? null)) {
                              updateItem(item, amount, item.unit ?? null);
                            }
                          }}
                        />
                        <Select
                          value={item.unit ?? ""}
                          class="w-24"
                          onValueChange={(v) =>
                            updateItem(item, item.amount ?? null, v || null)}
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
                      </InputBar>
                      <Input
                        type="date"
                        value={item.expires_at ?? ""}
                        title="Best before"
                        class="w-36"
                        onChange={(e) => {
                          const val =
                            (e.currentTarget as HTMLInputElement).value || null;
                          updateItem(
                            item,
                            item.amount ?? null,
                            item.unit ?? null,
                            val,
                          );
                        }}
                      />
                      <Button
                        type="button"
                        variant="danger-ghost"
                        icon={IconTrash}
                        title="Remove"
                        onClick={() => removeItem(item.id)}
                      />
                    </div>
                    {isMerging && (
                      <div class="ml-4 mt-1 mb-2 p-2 rounded border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 space-y-1.5">
                        <div class="text-xs font-medium text-stone-600 dark:text-stone-400">
                          Merge into "{item.name}" ({formatInputValue(
                            item.amount,
                          )} {item.unit ?? ""}):
                        </div>
                        {siblings.map((sib) => (
                          <div
                            key={sib.id}
                            class="flex items-center gap-2 text-sm"
                          >
                            <span class="flex-1 min-w-0 truncate">
                              {formatInputValue(sib.amount)} {sib.unit ?? ""}
                              {" "}
                              {sib.expires_at ? `(exp. ${sib.expires_at})` : ""}
                            </span>
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => mergeItems(item.id, [sib.id])}
                            >
                              Merge
                            </Button>
                          </div>
                        ))}
                        {siblings.length > 1 && (
                          <Button
                            type="button"
                            size="xs"
                            class="w-full"
                            onClick={() =>
                              mergeItems(
                                item.id,
                                siblings.map((s) => s.id),
                              )}
                          >
                            Merge all ({siblings.length})
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
