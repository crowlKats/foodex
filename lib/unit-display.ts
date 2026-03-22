import { convertAmount } from "./unit-convert.ts";

export type UnitSystem = "metric" | "imperial";

/** Preferred display unit for each base unit, keyed by system. */
const DISPLAY_UNITS: Record<UnitSystem, Record<string, string>> = {
  metric: {}, // no conversion needed — metric is the storage default
  imperial: {
    g: "oz",
    kg: "lb",
    ml: "fl oz",
    l: "fl oz",
    cl: "fl oz",
    dl: "fl oz",
    cm: "inch",
    mm: "inch",
  },
};

/**
 * Imperial thresholds: if the converted amount exceeds this, step up to a
 * larger unit for readability (e.g. 20 oz → 1.25 lb).
 */
const STEP_UP: Record<string, { unit: string; threshold: number }> = {
  oz: { unit: "lb", threshold: 16 },
  "fl oz": { unit: "cup", threshold: 8 },
};

export interface DisplayUnit {
  amount: number;
  unit: string;
}

/**
 * Convert a stored (metric) amount + unit into the user's preferred unit
 * system. Returns the converted amount and display unit. Falls back to the
 * original if no conversion is defined or possible.
 */
export function toDisplayUnit(
  amount: number,
  unit: string,
  system: UnitSystem,
  density?: number | null,
): DisplayUnit {
  if (system === "metric") return { amount, unit };

  const targetUnit = DISPLAY_UNITS.imperial[unit];
  if (!targetUnit) return { amount, unit };

  const converted = convertAmount(amount, unit, targetUnit, density);
  if (converted == null) return { amount, unit };

  // Step up to a larger unit when the value is large
  const step = STEP_UP[targetUnit];
  if (step && converted >= step.threshold) {
    const stepped = convertAmount(amount, unit, step.unit, density);
    if (stepped != null) {
      return { amount: stepped, unit: step.unit };
    }
  }

  return { amount: converted, unit: targetUnit };
}
