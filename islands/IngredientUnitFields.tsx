import { useSignal } from "@preact/signals";
import { UNIT_GROUPS, VOLUME_UNITS, WEIGHT_UNITS } from "../lib/units.ts";

interface Props {
  unit: string;
  density: number | null;
}

function isMassOrVolume(unit: string): boolean {
  return WEIGHT_UNITS.includes(unit) || VOLUME_UNITS.includes(unit);
}

export default function IngredientUnitFields({ unit, density }: Props) {
  const selectedUnit = useSignal(unit);

  return (
    <>
      <div class="space-y-1">
        <label class="text-sm font-medium">Unit</label>
        <select
          name="unit"
          required
          class="w-full"
          value={selectedUnit.value}
          onChange={(e) => {
            selectedUnit.value = (e.target as HTMLSelectElement).value;
          }}
        >
          <option value="">-- Unit --</option>
          {UNIT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.units.map((u) => (
                <option key={u.name} value={u.name}>
                  {u.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {isMassOrVolume(selectedUnit.value) && (
        <fieldset class="space-y-1">
          <legend class="text-sm font-medium">Mass/volume conversion</legend>
          <div class="flex items-center gap-1.5 justify-between">
            <div class="flex">
              <input
                type="number"
                name="conv_amount1"
                step="any"
                min="0"
                value={density != null ? +(density * 100).toFixed(2) : ""}
                placeholder="Amt"
                class="flex-1 w-20"
              />
              <select name="conv_unit1" class="w-16 text-sm -ml-0.5">
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u} selected={u === "g"}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <span class="text-sm text-stone-500 select-none">=</span>
            <div class="flex">
              <input
                type="number"
                name="conv_amount2"
                step="any"
                min="0"
                value={density != null ? "100" : ""}
                placeholder="Amt"
                class="flex-1 w-20"
              />
              <select name="conv_unit2" class="w-16 text-sm -ml-0.5">
                {VOLUME_UNITS.map((u) => (
                  <option key={u} value={u} selected={u === "ml"}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p class="text-xs text-stone-500">
            Enables cost calculation when recipe and price use different unit
            types.
          </p>
        </fieldset>
      )}
    </>
  );
}
