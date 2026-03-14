import { UNIT_GROUPS } from "../lib/units.ts";

interface UnitSelectProps {
  name: string;
  value?: string;
  required?: boolean;
  class?: string;
}

export function UnitSelect(
  { name, value, required, class: className }: UnitSelectProps,
) {
  return (
    <select
      name={name}
      required={required}
      class={className ?? "w-full"}
    >
      <option value="">-- Unit --</option>
      {UNIT_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.units.map((u) => (
            <option key={u.name} value={u.name} selected={u.name === value}>
              {u.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
