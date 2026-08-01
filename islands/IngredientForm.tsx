import { useSignal } from "@preact/signals";
import { ALL_UNITS, UNIT_GROUPS } from "../lib/units.ts";
import SearchSelect from "./SearchSelect.tsx";
import { IconPlus } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Input, InputBar } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

interface Ingredient {
  key: string;
  name: string;
  amount: string;
  unit: string;
  ingredient_id: string;
  /** Scales with the recipe, but is never bought or counted as missing. */
  always_on_hand?: boolean;
}

interface IngredientItem extends Ingredient {
  _uid: string;
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
  const items = useSignal<IngredientItem[]>(
    (initialIngredients.length > 0
      ? initialIngredients
      : [{ key: "", name: "", amount: "", unit: "", ingredient_id: "" }])
      .map((i) => ({ ...i, _uid: crypto.randomUUID() })),
  );

  const options = availableIngredients.map((g) => ({
    id: g.id,
    name: g.name,
    detail: g.unit || undefined,
  }));

  function add() {
    items.value = [
      ...items.value,
      {
        key: "",
        name: "",
        amount: "",
        unit: "",
        ingredient_id: "",
        _uid: crypto.randomUUID(),
      },
    ];
  }

  function remove(index: number) {
    items.value = items.value.filter((_, i) => i !== index);
  }

  function update(index: number, field: keyof Ingredient, value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };
    items.value = next;
  }

  function updateFlag(index: number, value: boolean) {
    const next = [...items.value];
    next[index] = { ...next[index], always_on_hand: value };
    items.value = next;
  }

  function selectIngredient(index: number, id: string) {
    const g = availableIngredients.find((g) => g.id === id);
    if (!g) return;
    const next = [...items.value];
    next[index] = {
      ...next[index],
      ingredient_id: g.id,
      name: g.name,
      key: slugifyKey(g.name),
      unit: g.unit && ALL_UNITS.includes(g.unit) && !next[index].unit
        ? g.unit
        : next[index].unit,
    };
    items.value = next;
  }

  function clearIngredient(index: number) {
    const next = [...items.value];
    next[index] = { ...next[index], ingredient_id: "" };
    items.value = next;
  }

  function handleFreeText(index: number, text: string) {
    const next = [...items.value];
    next[index] = {
      ...next[index],
      name: text,
      key: next[index].ingredient_id ? next[index].key : slugifyKey(text),
    };
    items.value = next;
  }

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.value.map((item, i) => (
        <div key={item._uid} class="card p-3 space-y-2">
          <div class="flex gap-2 items-center min-w-0">
            <SearchSelect
              value={{ id: item.ingredient_id, name: item.name }}
              options={options}
              placeholder="Search or type ingredient..."
              onSelect={(o) =>
                selectIngredient(i, o.id)}
              onClear={() =>
                clearIngredient(i)}
              onChange={(text) => handleFreeText(i, text)}
            />
            <Button
              type="button"
              variant="danger-ghost"
              icon={IconTrash}
              title="Remove ingredient"
              class="shrink-0"
              onClick={() => remove(i)}
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <InputBar>
              <Input
                type="number"
                placeholder="Amount"
                step="any"
                value={item.amount}
                onValueChange={(v) => update(i, "amount", v)}
                size="sm"
              />
              <Select
                value={item.unit}
                onValueChange={(v) => update(i, "unit", v)}
                size="sm"
              >
                <option value="">-- Unit --</option>
                {UNIT_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.units.map((u) => (
                      <option key={u.name} value={u.name}>{u.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </InputBar>
            <Input
              type="text"
              placeholder="key (for templates)"
              value={item.key}
              onValueChange={(v) => update(i, "key", v)}
              size="sm"
              monospace
            />
          </div>
          {
            /*
            Water is in a large share of recipes: it has to scale, but
            declaring it as an ingredient used to put it on the shopping list
            and count it as missing from the pantry. Same for ice, and for
            salt or oil depending on how the author thinks about staples.
          */
          }
          <label class="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 cursor-pointer">
            <input
              type="checkbox"
              class="size-3.5 accent-orange-600 cursor-pointer"
              checked={!!item.always_on_hand}
              onChange={(e) =>
                updateFlag(i, (e.currentTarget as HTMLInputElement).checked)}
            />
            Always on hand — scales, but never bought or counted as missing
          </label>
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
          <input
            type="hidden"
            name={`ingredients[${i}][always_on_hand]`}
            value={item.always_on_hand ? "1" : ""}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        class="link text-sm font-medium my-14"
      >
        <IconPlus class="size-3.5 inline mr-1" />Add Ingredient
      </button>
    </div>
  );
}
