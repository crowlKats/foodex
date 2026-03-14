import { useSignal } from "@preact/signals";
import { ALL_UNITS, UNIT_GROUPS } from "../lib/units.ts";
import TbPlus from "tb-icons/TbPlus";
import TbX from "tb-icons/TbX";

interface Ingredient {
  key: string;
  name: string;
  amount: string;
  unit: string;
  ingredient_id: string;
}

interface IngredientFormProps {
  initialIngredients: Ingredient[];
  ingredients: { id: string; name: string; unit: string }[];
}

function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function IngredientForm(
  { initialIngredients, ingredients: availableIngredients }:
    IngredientFormProps,
) {
  const items = useSignal<Ingredient[]>(
    initialIngredients.length > 0
      ? [...initialIngredients]
      : [{ key: "", name: "", amount: "", unit: "", ingredient_id: "" }],
  );

  function add() {
    items.value = [
      ...items.value,
      { key: "", name: "", amount: "", unit: "", ingredient_id: "" },
    ];
  }

  function remove(index: number) {
    items.value = items.value.filter((_, i) => i !== index);
  }

  function update(index: number, field: keyof Ingredient, value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };

    // Auto-fill from ingredient selection
    if (field === "ingredient_id" && value) {
      const g = availableIngredients.find((g) => g.id === value);
      if (g) {
        next[index].name = g.name;
        next[index].key = slugifyKey(g.name);
        if (g.unit && !next[index].unit && ALL_UNITS.includes(g.unit)) {
          next[index].unit = g.unit;
        }
      }
    } else if (field === "ingredient_id" && !value) {
      next[index].name = "";
      next[index].key = "";
    }

    items.value = next;
  }

  return (
    <div class="space-y-3">
      {items.value.map((item, i) => (
        <div key={i} class="card p-3 space-y-2">
          <div class="flex gap-2 items-center">
            <select
              value={item.ingredient_id}
              onInput={(e) =>
                update(
                  i,
                  "ingredient_id",
                  (e.target as HTMLSelectElement).value,
                )}
              class="flex-1 text-sm"
            >
              <option value="">-- Link ingredient --</option>
              {availableIngredients.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              class="text-red-600 hover:text-red-700 px-1 cursor-pointer"
            >
              <TbX class="size-4" />
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <div class="flex">
              <input
                type="number"
                placeholder="Amount"
                step="any"
                value={item.amount}
                onInput={(e) =>
                  update(i, "amount", (e.target as HTMLInputElement).value)}
                class="flex-1 text-sm"
              />
              <select
                value={item.unit}
                onInput={(e) =>
                  update(i, "unit", (e.target as HTMLSelectElement).value)}
                class="text-sm -ml-0.5"
              >
                <option value="">-- Unit --</option>
                {UNIT_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.units.map((u) => (
                      <option key={u.name} value={u.name}>{u.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="key (for templates)"
              value={item.key}
              onInput={(e) =>
                update(i, "key", (e.target as HTMLInputElement).value)}
              class="text-sm font-mono"
            />
          </div>
          <p class="text-xs text-stone-400">
            {item.key
              ? (
                <span>
                  Use{" "}
                  <code class="code-hint">
                    {`{{ ${item.key} }}`}
                  </code>{" "}
                  in steps for scaled output, or{" "}
                  <code class="code-hint">
                    {`{{ ${item.key}.amount }}`}
                  </code>{" "}
                  for just the number
                </span>
              )
              : "Enter a name to auto-generate the template key"}
          </p>
          {/* Hidden fields for form submission */}
          <input
            type="hidden"
            name={`ingredients[${i}][key]`}
            value={item.key}
          />
          <input
            type="hidden"
            name={`ingredients[${i}][name]`}
            value={item.name}
          />
          <input
            type="hidden"
            name={`ingredients[${i}][amount]`}
            value={item.amount}
          />
          <input
            type="hidden"
            name={`ingredients[${i}][unit]`}
            value={item.unit}
          />
          <input
            type="hidden"
            name={`ingredients[${i}][ingredient_id]`}
            value={item.ingredient_id}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        class="link text-sm font-medium"
      >
        <TbPlus class="size-3.5 inline mr-1" />Add Ingredient
      </button>
    </div>
  );
}
