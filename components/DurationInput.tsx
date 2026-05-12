import { InputBar } from "./Input.tsx";

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
      <InputBar>
        <input
          type="number"
          name={name}
          min="0"
          value={value ?? ""}
        />
        <select name={`${name}_unit`} class="w-20 text-xs">
          <option value="min" selected={unit === "min"}>min</option>
          <option value="hr" selected={unit === "hr"}>hr</option>
        </select>
      </InputBar>
    </div>
  );
}
