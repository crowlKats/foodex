interface DurationInputProps {
  name: string;
  label: string;
  value?: string;
  unit?: string;
}

export function DurationInput(
  { name, label, value, unit }: DurationInputProps,
) {
  return (
    <div>
      <label class="block text-sm font-medium mb-1">{label}</label>
      <div class="flex min-w-0">
        <input
          type="number"
          name={name}
          min="0"
          value={value ?? ""}
          class="flex-1 min-w-0"
        />
        <select name={`${name}_unit`} class="w-20 shrink-0 text-xs -ml-0.5">
          <option value="min" selected={unit === "min"}>min</option>
          <option value="hr" selected={unit === "hr"}>hr</option>
        </select>
      </div>
    </div>
  );
}
