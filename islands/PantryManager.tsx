import { useComputed, useSignal } from "@preact/signals";
import SearchSelect from "./SearchSelect.tsx";
import type { SearchSelectOption } from "./SearchSelect.tsx";
import { UNIT_GROUPS } from "../lib/units.ts";
import TbTrash from "tb-icons/TbTrash";
import TbAlertTriangle from "tb-icons/TbAlertTriangle";

interface PantryItem {
  id: number;
  ingredient_id?: number;
  name: string;
  amount?: number;
  unit?: string;
  expires_at?: string;
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

interface PantryManagerProps {
  householdId: number;
  initialItems: PantryItem[];
  ingredients: PantryIngredient[];
}

export default function PantryManager(
  { householdId, initialItems, ingredients }: PantryManagerProps,
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

  const expiringSoonCount = useComputed(() =>
    items.value.filter((i) => {
      const s = expiryStatus(i.expires_at);
      return s === "soon" || s === "expired";
    }).length
  );

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
        ingredient_id: selectedIngredient.value.id
          ? parseInt(selectedIngredient.value.id)
          : null,
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
          ingredient_id: selectedIngredient.value.id
            ? parseInt(selectedIngredient.value.id)
            : undefined,
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

  async function removeItem(itemId: number) {
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
    <div class="grid gap-6 md:grid-cols-2">
      <div>
        <h2 class="text-lg font-semibold mb-3">Add Item</h2>
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
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block text-sm font-medium mb-1">
                Amount <span class="text-stone-400">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={newAmount}
                class="w-full"
                placeholder="e.g. 500"
                onInput={(e) => {
                  newAmount.value = (e.target as HTMLInputElement).value;
                }}
              />
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium mb-1">Unit</label>
              <select
                value={newUnit}
                class="w-full"
                onChange={(e) => {
                  newUnit.value = (e.target as HTMLSelectElement).value;
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
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">
              Best before <span class="text-stone-400">(optional)</span>
            </label>
            <input
              type="date"
              value={newExpiresAt}
              class="w-full"
              onInput={(e) => {
                newExpiresAt.value = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <button
            type="button"
            class="btn btn-primary"
            disabled={saving.value ||
              (!selectedIngredient.value.id && !newName.value.trim())}
            onClick={addItem}
          >
            {saving.value ? "Adding..." : "Add to Pantry"}
          </button>
        </div>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-3">
          In Stock ({items.value.length})
        </h2>
        {expiringSoonCount.value > 0 && (
          <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm mb-3">
            <TbAlertTriangle class="size-4 shrink-0" />
            <span>
              {expiringSoonCount.value}{" "}
              {expiringSoonCount.value === 1 ? "item needs" : "items need"} to
              be used soon
            </span>
          </div>
        )}
        {items.value.length === 0
          ? (
            <p class="text-stone-500">
              Your pantry is empty. Add ingredients you have on hand.
            </p>
          )
          : (
            <div class="space-y-1">
              {items.value.map((item) => {
                const status = expiryStatus(item.expires_at);
                return (
                  <div
                    key={item.id}
                    class={`card flex flex-wrap items-center gap-2 py-2${
                      status === "expired"
                        ? " border-red-300 dark:border-red-700"
                        : status === "soon"
                        ? " border-amber-300 dark:border-amber-700"
                        : ""
                    }`}
                  >
                    <div class="flex-1 min-w-0">
                      <span class="font-medium text-sm">{item.name}</span>
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
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.amount ?? ""}
                      placeholder="Qty"
                      class="w-20"
                      onBlur={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        const amount = val ? parseFloat(val) : null;
                        if (amount !== (item.amount ?? null)) {
                          updateItem(item, amount, item.unit ?? null);
                        }
                      }}
                    />
                    <select
                      value={item.unit ?? ""}
                      class="w-24"
                      onChange={(e) => {
                        const unit = (e.target as HTMLSelectElement).value ||
                          null;
                        updateItem(item, item.amount ?? null, unit);
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
                    <input
                      type="date"
                      value={item.expires_at ?? ""}
                      title="Best before"
                      class="w-36"
                      onChange={(e) => {
                        const val = (e.target as HTMLInputElement).value ||
                          null;
                        updateItem(
                          item,
                          item.amount ?? null,
                          item.unit ?? null,
                          val,
                        );
                      }}
                    />
                    <button
                      type="button"
                      class="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                      title="Remove"
                      onClick={() => removeItem(item.id)}
                    >
                      <TbTrash class="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
