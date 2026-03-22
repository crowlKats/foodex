import { useSignal } from "@preact/signals";
import {
  QUANTITY_DEFAULTS,
  QUANTITY_TYPES,
  QUANTITY_UNITS,
  type QuantityType,
} from "../lib/quantity.ts";
import { formatInputValue } from "../lib/format.ts";

interface QuantityInputProps {
  initialType?: string;
  initialValue?: number;
  initialUnit?: string;
  initialValue2?: number;
  initialValue3?: number;
}

export default function QuantityInput(
  {
    initialType = "servings",
    initialValue = 4,
    initialUnit = "servings",
    initialValue2,
    initialValue3,
  }: QuantityInputProps,
) {
  const qType = useSignal<QuantityType>(initialType as QuantityType);
  const qValue = useSignal(initialValue);
  const qUnit = useSignal(initialUnit);
  const qValue2 = useSignal(initialValue2 ?? 0);
  const qValue3 = useSignal(initialValue3 ?? 0);

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
        <select
          class="w-full"
          value={qType.value}
          onChange={(e) =>
            onTypeChange(
              (e.target as HTMLSelectElement).value as QuantityType,
            )}
        >
          {QUANTITY_TYPES.map((qt) => (
            <option key={qt.type} value={qt.type}>{qt.label}</option>
          ))}
        </select>
      </div>

      {qType.value === "dimensions"
        ? (
          <div class="flex-1 min-w-0">
            <label class="block text-sm font-medium mb-1">
              Tray size (W x L x D)
            </label>
            <div class="flex items-center gap-1">
              <input
                type="number"
                min="1"
                step="0.5"
                value={formatInputValue(qValue.value)}
                placeholder="W"
                class="flex-1 min-w-0 text-center"
                onInput={(e) => {
                  qValue.value =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                }}
              />
              <span class="text-stone-500 text-sm shrink-0">&times;</span>
              <input
                type="number"
                min="1"
                step="0.5"
                value={formatInputValue(qValue2.value)}
                placeholder="L"
                class="flex-1 min-w-0 text-center"
                onInput={(e) => {
                  qValue2.value =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                }}
              />
              <span class="text-stone-500 text-sm shrink-0">&times;</span>
              <input
                type="number"
                min="1"
                step="0.5"
                value={formatInputValue(qValue3.value)}
                placeholder="D"
                class="flex-1 min-w-0 text-center"
                onInput={(e) => {
                  qValue3.value =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                }}
              />
              <span class="text-stone-500 text-sm whitespace-nowrap">cm</span>
            </div>
          </div>
        )
        : (
          <div class="flex-1 min-w-0">
            <label class="block text-sm font-medium mb-1">Amount</label>
            <div class="flex">
              <input
                type="number"
                min="1"
                step={qType.value === "servings" ? "1" : "any"}
                value={formatInputValue(qValue.value)}
                class={units.length > 1 ? "flex-1 min-w-0" : "w-full"}
                onInput={(e) => {
                  qValue.value =
                    parseFloat((e.target as HTMLInputElement).value) || 0;
                }}
              />
              {units.length > 1
                ? (
                  <select
                    class="w-28 shrink-0 -ml-0.5"
                    value={qUnit}
                    onChange={(e) => {
                      qUnit.value = (e.target as HTMLSelectElement).value;
                    }}
                  >
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                )
                : (
                  <span class="flex items-center text-sm text-stone-500 px-2">
                    {units[0] ?? ""}
                  </span>
                )}
            </div>
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
    </div>
  );
}
