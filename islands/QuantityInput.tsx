import { useSignal } from "@preact/signals";
import {
  QUANTITY_DEFAULTS,
  QUANTITY_TYPES,
  QUANTITY_UNITS,
  type QuantityType,
} from "../lib/quantity.ts";
import { formatInputValue } from "../lib/format.ts";
import { Input, InputBar } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

interface QuantityInputProps {
  initialType?: string;
  initialValue?: number;
  initialUnit?: string;
  initialValue2?: number;
  initialValue3?: number;
  /** Dimensions recipes: the stated yield in servings/pieces, if any. */
  initialServings?: number;
}

export default function QuantityInput(
  {
    initialType = "servings",
    initialValue = 4,
    initialUnit = "servings",
    initialValue2,
    initialValue3,
    initialServings,
  }: QuantityInputProps,
) {
  const qType = useSignal<QuantityType>(initialType as QuantityType);
  const qValue = useSignal(initialValue);
  const qUnit = useSignal(initialUnit);
  const qValue2 = useSignal(initialValue2 ?? 0);
  const qValue3 = useSignal(initialValue3 ?? 0);
  const qServings = useSignal(initialServings ?? 0);

  function onTypeChange(newType: QuantityType) {
    qType.value = newType;
    const defaults = QUANTITY_DEFAULTS[newType];
    qValue.value = defaults.value;
    qUnit.value = defaults.unit;
    qValue2.value = defaults.value2 ?? 0;
    qValue3.value = defaults.value3 ?? 0;
  }

  const units = QUANTITY_UNITS[qType.value] ?? [];

  return (
    <div class="flex gap-2 max-sm:flex-col">
      <div class="flex-1">
        <label class="block text-sm font-medium mb-1">Quantity type</label>
        <Select
          class="w-full"
          value={qType.value}
          onValueChange={(v) => onTypeChange(v as QuantityType)}
        >
          {QUANTITY_TYPES.map((qt) => (
            <option key={qt.type} value={qt.type}>{qt.label}</option>
          ))}
        </Select>
      </div>

      {qType.value === "dimensions"
        ? (
          <div class="flex-1 min-w-0">
            <label class="block text-sm font-medium mb-1">
              Tray size (W x L x D)
            </label>
            <div class="flex items-center gap-1">
              <Input
                type="number"
                min="1"
                step="0.5"
                value={formatInputValue(qValue.value)}
                placeholder="W"
                class="flex-1 min-w-0 text-center"
                onValueChange={(v) => qValue.value = parseFloat(v) || 0}
              />
              <span class="text-stone-500 text-sm shrink-0">&times;</span>
              <Input
                type="number"
                min="1"
                step="0.5"
                value={formatInputValue(qValue2.value)}
                placeholder="L"
                class="flex-1 min-w-0 text-center"
                onValueChange={(v) => qValue2.value = parseFloat(v) || 0}
              />
              <span class="text-stone-500 text-sm shrink-0">&times;</span>
              <Input
                type="number"
                min="1"
                step="0.5"
                value={formatInputValue(qValue3.value)}
                placeholder="D"
                class="flex-1 min-w-0 text-center"
                onValueChange={(v) => qValue3.value = parseFloat(v) || 0}
              />
              <span class="text-stone-500 text-sm whitespace-nowrap">cm</span>
            </div>
            <label
              class="block text-xs text-stone-500 dark:text-stone-400 mt-2"
              title="The tray stays the scaling quantity; this records how many pieces it makes."
            >
              Makes about{" "}
              <Input
                type="number"
                min="1"
                step="1"
                size="xs"
                value={qServings.value > 0
                  ? formatInputValue(qServings.value)
                  : ""}
                placeholder="—"
                class="w-16 text-center inline-block"
                onValueChange={(v) => qServings.value = parseInt(v) || 0}
              />{" "}
              servings/pieces (optional)
            </label>
          </div>
        )
        : (
          <div class="flex-1 min-w-0">
            <label class="block text-sm font-medium mb-1">Amount</label>
            {units.length > 1
              ? (
                <InputBar>
                  <Input
                    type="number"
                    min="1"
                    step={qType.value === "servings" ? "1" : "any"}
                    value={formatInputValue(qValue.value)}
                    onValueChange={(v) => qValue.value = parseFloat(v) || 0}
                  />
                  <Select
                    class="w-28"
                    value={qUnit}
                    onValueChange={(v) => qUnit.value = v}
                  >
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </InputBar>
              )
              : (
                <div class="flex">
                  <Input
                    type="number"
                    min="1"
                    step={qType.value === "servings" ? "1" : "any"}
                    value={formatInputValue(qValue.value)}
                    class="w-full"
                    onValueChange={(v) => qValue.value = parseFloat(v) || 0}
                  />
                  <span class="flex items-center text-sm text-stone-500 px-2">
                    {units[0] ?? ""}
                  </span>
                </div>
              )}
          </div>
        )}

      <input type="hidden" name="quantity_type" value={qType.value} />
      <input type="hidden" name="quantity_value" value={String(qValue.value)} />
      <input type="hidden" name="quantity_unit" value={qUnit.value} />
      <input
        type="hidden"
        name="quantity_value2"
        value={qType.value === "dimensions" ? String(qValue2.value) : ""}
      />
      <input
        type="hidden"
        name="quantity_value3"
        value={qType.value === "dimensions" ? String(qValue3.value) : ""}
      />
      <input
        type="hidden"
        name="quantity_unit2"
        value={qType.value === "dimensions" ? "cm" : ""}
      />
      <input
        type="hidden"
        name="quantity_servings"
        value={qType.value === "dimensions" && qServings.value > 0
          ? String(qServings.value)
          : ""}
      />
    </div>
  );
}
