import { useSignal } from "@preact/signals";
import { UNIT_GROUPS } from "../lib/units.ts";
import SearchSelect from "./SearchSelect.tsx";
import { Input, InputBar } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

interface Props {
  ingredients: { id: string; name: string; unit: string }[];
  initialIngredientId?: string;
  initialIngredientName?: string;
  initialAmount?: string;
  initialUnit?: string;
  initialExpiresDays?: number;
}

const SHELF_LIFE_UNITS = [
  { value: "days", label: "days", multiplier: 1 },
  { value: "weeks", label: "weeks", multiplier: 7 },
  { value: "months", label: "months", multiplier: 30 },
] as const;

function daysToDisplay(days: number): { value: number; unit: string } {
  if (days % 30 === 0 && days >= 30) {
    return { value: days / 30, unit: "months" };
  }
  if (days % 7 === 0 && days >= 7) return { value: days / 7, unit: "weeks" };
  return { value: days, unit: "days" };
}

export default function RecipeOutputForm({
  ingredients,
  initialIngredientId,
  initialIngredientName,
  initialAmount,
  initialUnit,
  initialExpiresDays,
}: Props) {
  const ingredientId = useSignal(initialIngredientId ?? "");
  const ingredientName = useSignal(initialIngredientName ?? "");
  const amount = useSignal(initialAmount ?? "");
  const unit = useSignal(initialUnit ?? "");
  const initial = initialExpiresDays != null
    ? daysToDisplay(initialExpiresDays)
    : null;
  const shelfLifeValue = useSignal(initial ? String(initial.value) : "");
  const shelfLifeUnit = useSignal(initial?.unit ?? "days");

  const options = ingredients.map((g) => ({
    id: g.id,
    name: g.name,
    detail: g.unit || undefined,
  }));

  return (
    <div class="space-y-2">
      <p class="text-xs text-stone-500">
        If this recipe produces an ingredient (e.g. lemon curd, pizza dough),
        select it here with the yield amount.
      </p>
      <SearchSelect
        value={{ id: ingredientId.value, name: ingredientName.value }}
        options={options}
        placeholder="Search ingredient..."
        onSelect={(o) => {
          ingredientId.value = o.id;
          ingredientName.value = o.name;
          const ing = ingredients.find((g) => g.id === o.id);
          if (ing?.unit && !unit.value) {
            unit.value = ing.unit;
          }
        }}
        onClear={() => {
          ingredientId.value = "";
          ingredientName.value = "";
        }}
      />
      {ingredientId.value && (
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <InputBar>
            <Input
              type="number"
              placeholder="Yield amount"
              step="any"
              value={amount.value}
              onValueChange={(v) => amount.value = v}
              size="sm"
            />
            <Select
              value={unit.value}
              onValueChange={(v) => unit.value = v}
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
          <div>
            <InputBar>
              <Input
                type="number"
                placeholder="Shelf life"
                min="1"
                step="1"
                value={shelfLifeValue.value}
                onValueChange={(v) => shelfLifeValue.value = v}
                size="sm"
              />
              <Select
                value={shelfLifeUnit.value}
                onValueChange={(v) => shelfLifeUnit.value = v}
                size="sm"
              >
                {SHELF_LIFE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </Select>
            </InputBar>
          </div>
        </div>
      )}
      <input
        type="hidden"
        name="output_ingredient_id"
        value={ingredientId.value}
      />
      <input type="hidden" name="output_amount" value={amount.value} />
      <input type="hidden" name="output_unit" value={unit.value} />
      <input
        type="hidden"
        name="output_expires_days"
        value={shelfLifeValue.value
          ? String(
            parseInt(shelfLifeValue.value) *
              (SHELF_LIFE_UNITS.find((u) => u.value === shelfLifeUnit.value)
                ?.multiplier ?? 1),
          )
          : ""}
      />
    </div>
  );
}
