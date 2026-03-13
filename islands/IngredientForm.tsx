import { useSignal } from "@preact/signals";

interface Ingredient {
  name: string;
  amount: string;
  unit: string;
  grocery_id: string;
}

interface IngredientFormProps {
  initialIngredients: Ingredient[];
  groceries: { id: string; name: string; unit: string }[];
}

export default function IngredientForm(
  { initialIngredients, groceries }: IngredientFormProps,
) {
  const items = useSignal<Ingredient[]>(
    initialIngredients.length > 0
      ? [...initialIngredients]
      : [{ name: "", amount: "", unit: "", grocery_id: "" }],
  );

  function add() {
    items.value = [...items.value, {
      name: "",
      amount: "",
      unit: "",
      grocery_id: "",
    }];
  }

  function remove(index: number) {
    items.value = items.value.filter((_, i) => i !== index);
  }

  function update(index: number, field: keyof Ingredient, value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };

    // Auto-fill name from grocery selection
    if (field === "grocery_id" && value) {
      const g = groceries.find((g) => g.id === value);
      if (g) {
        next[index].name = g.name;
        if (g.unit && !next[index].unit) {
          next[index].unit = g.unit;
        }
      }
    }

    items.value = next;
  }

  return (
    <div class="space-y-2">
      {items.value.map((item, i) => (
        <div key={i} class="flex gap-2 items-start">
          <div class="flex-1 grid grid-cols-4 gap-2">
            <select
              value={item.grocery_id}
              onInput={(e) =>
                update(i, "grocery_id", (e.target as HTMLSelectElement).value)}
              class="border rounded px-2 py-1.5 text-sm"
            >
              <option value="">-- Grocery --</option>
              {groceries.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Name"
              value={item.name}
              onInput={(e) =>
                update(i, "name", (e.target as HTMLInputElement).value)}
              class="border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              placeholder="Amount"
              step="any"
              value={item.amount}
              onInput={(e) =>
                update(i, "amount", (e.target as HTMLInputElement).value)}
              class="border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Unit"
              value={item.unit}
              onInput={(e) =>
                update(i, "unit", (e.target as HTMLInputElement).value)}
              class="border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            class="text-red-600 hover:text-red-800 px-2 py-1"
          >
            &times;
          </button>
          {/* Hidden fields for form submission */}
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
            name={`ingredients[${i}][grocery_id]`}
            value={item.grocery_id}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        class="text-sm text-blue-600 hover:text-blue-800"
      >
        + Add Ingredient
      </button>
    </div>
  );
}
