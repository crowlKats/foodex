import { useSignal } from "@preact/signals";
import { UNIT_GROUPS, VOLUME_UNITS, WEIGHT_UNITS } from "../lib/units.ts";
import { Input, InputBar } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

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
        <Select
          name="unit"
          required
          class="w-full"
          value={selectedUnit.value}
          onValueChange={(v) => selectedUnit.value = v}
        >
          <option value="" selected={selectedUnit.value === ""}>
            -- Unit --
          </option>
          {UNIT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.units.map((u) => (
                <option
                  key={u.name}
                  value={u.name}
                  selected={u.name === selectedUnit.value}
                >
                  {u.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      {isMassOrVolume(selectedUnit.value) && (
        <fieldset class="space-y-1">
          <legend class="text-sm font-medium">Mass/volume conversion</legend>
          <div class="flex items-center gap-1.5 justify-between">
            <InputBar>
              <Input
                type="number"
                name="conv_amount1"
                step="any"
                min="0"
                value={density != null ? +(density * 100).toFixed(2) : ""}
                placeholder="Amt"
                class="w-20"
              />
              <Select name="conv_unit1" class="w-16" size="sm">
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u} selected={u === "g"}>
                    {u}
                  </option>
                ))}
              </Select>
            </InputBar>
            <span class="text-sm text-stone-500 select-none">=</span>
            <InputBar>
              <Input
                type="number"
                name="conv_amount2"
                step="any"
                min="0"
                value={density != null ? "100" : ""}
                placeholder="Amt"
                class="w-20"
              />
              <Select name="conv_unit2" class="w-16" size="sm">
                {VOLUME_UNITS.map((u) => (
                  <option key={u} value={u} selected={u === "ml"}>
                    {u}
                  </option>
                ))}
              </Select>
            </InputBar>
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
