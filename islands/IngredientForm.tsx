import { useSignal } from "@preact/signals";
import { ALL_UNITS, UNIT_GROUPS } from "../lib/units.ts";
import SearchSelect from "./SearchSelect.tsx";
import { IconPlus } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Checkbox } from "../components/Checkbox.tsx";
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
    <div class="space-y-4">
      {
        /*
        The template-key and always-on-hand rules used to be spelled out on
        every row, which meant the same two sentences repeated once per
        ingredient and drowned out the fields. Explain them once here instead.

        One line per rule, rather than both run together: as a single
        paragraph it had to wrap mid-phrase, and the break landed wherever the
        container happened to end. `text-pretty` keeps that tidy if a line
        does wrap on a narrow screen.
      */
      }
      <div class="text-xs text-stone-500 dark:text-stone-400 space-y-1 text-pretty">
        <p>
          Reference an ingredient in a step with{" "}
          <code class="code-hint">{"{{ key }}"}</code>.
        </p>
        <p>
          Tick <span class="font-medium">Always on hand</span>{" "}
          for staples like water or salt — they scale, but are never bought or
          counted as missing.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.value.map((item, i) => (
          <div key={item._uid} class="form-row space-y-2">
            <div class="flex gap-2 items-center min-w-0">
              <span class="text-xs text-stone-400 font-mono shrink-0 w-5">
                #{i + 1}
              </span>
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
            <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:pl-7">
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
              <div
                class="flex min-w-0 [&>:not(:first-child)]:-ml-0.5"
                title="Template key — how you refer to this ingredient in steps"
              >
                <span class="input-affix">{"{{"}</span>
                <Input
                  type="text"
                  placeholder="key"
                  value={item.key}
                  onValueChange={(v) => update(i, "key", v)}
                  size="sm"
                  monospace
                  class="w-full sm:w-28 min-w-0 text-center"
                />
                <span class="input-affix">{"}}"}</span>
              </div>
            </div>
            {
              /*
              Water is in a large share of recipes: it has to scale, but
              declaring it as an ingredient used to put it on the shopping list
              and count it as missing from the pantry. Same for ice, and for
              salt or oil depending on how the author thinks about staples.
            */
            }
            <Checkbox
              class="sm:pl-7"
              labelClass="text-xs text-stone-500 dark:text-stone-400"
              title="Scales with the recipe, but is never added to the shopping list or counted as missing from the pantry."
              checked={!!item.always_on_hand}
              onChange={(e) =>
                updateFlag(i, (e.currentTarget as HTMLInputElement).checked)}
              label="Always on hand"
            />
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
      </div>
      <button
        type="button"
        onClick={add}
        class="link text-sm font-medium"
      >
        <IconPlus class="size-3.5 inline mr-1" />Add Ingredient
      </button>
    </div>
  );
}
