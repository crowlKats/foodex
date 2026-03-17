export interface UnitDef {
  name: string;
  step: string; // HTML input step attribute
}

export interface UnitGroup {
  label: string;
  units: UnitDef[];
}

export const UNIT_GROUPS: UnitGroup[] = [
  {
    label: "Weight",
    units: [
      { name: "g", step: "1" },
      { name: "kg", step: "0.01" },
      { name: "mg", step: "1" },
      { name: "oz", step: "0.1" },
      { name: "lb", step: "0.01" },
    ],
  },
  {
    label: "Volume",
    units: [
      { name: "ml", step: "1" },
      { name: "l", step: "0.01" },
      { name: "cl", step: "1" },
      { name: "dl", step: "1" },
      { name: "tsp", step: "0.25" },
      { name: "tbsp", step: "0.5" },
      { name: "cup", step: "0.25" },
      { name: "fl oz", step: "0.1" },
    ],
  },
  {
    label: "Count",
    units: [
      { name: "pcs", step: "1" },
      { name: "slice", step: "1" },
      { name: "clove", step: "1" },
      { name: "bunch", step: "1" },
      { name: "sprig", step: "1" },
      { name: "pinch", step: "1" },
      { name: "dash", step: "1" },
    ],
  },
  {
    label: "Length",
    units: [
      { name: "cm", step: "0.1" },
      { name: "mm", step: "1" },
      { name: "inch", step: "0.1" },
    ],
  },
];

export const ALL_UNITS: string[] = UNIT_GROUPS.flatMap((g) =>
  g.units.map((u) => u.name)
);

export function getUnitStep(unitName: string): string {
  for (const group of UNIT_GROUPS) {
    const unit = group.units.find((u) => u.name === unitName);
    if (unit) return unit.step;
  }
  return "any";
}
