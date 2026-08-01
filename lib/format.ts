// Fine-grained metric units where fractional display is noise (e.g. 167 g, not
// 166.7 g). Count-based units like pcs/clove/slice are deliberately excluded —
// they can be genuinely fractional (0.25 pcs of nutmeg, half a clove).
const WHOLE_UNITS = new Set([
  "g",
  "mg",
  "ml",
  "cl",
  "dl",
  "mm",
]);

/**
 * Units you count out rather than measure. Scaling a 4-serving recipe to 6
 * genuinely wants one and a half onions, but "1.5 onion" reads like a bug —
 * these render as vulgar fractions instead. Includes the empty unit, which is
 * how bare countables ("1 yellow onion", "3 garlic cloves") are stored.
 */
const COUNT_UNITS = new Set([
  "",
  "pcs",
  "slice",
  "clove",
  "bunch",
  "sprig",
  "pinch",
  "dash",
]);

/** Fractions worth a glyph, and the tolerance for matching them. */
const VULGAR_FRACTIONS: [value: number, glyph: string][] = [
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];
const FRACTION_TOLERANCE = 0.02;

function formatCountable(n: number): string {
  if (n <= 0) return String(Math.round(n * 100) / 100);
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < FRACTION_TOLERANCE) return String(whole);
  for (const [value, glyph] of VULGAR_FRACTIONS) {
    if (Math.abs(frac - value) < FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  return String(Math.round(n * 100) / 100);
}

/**
 * Format a numeric amount for display — never shows unnecessary trailing zeros.
 * Rounds to 2 decimal places max. Fine-grained metric units (g, ml…) round by
 * magnitude: integer at 10+, 1 decimal under 10, 2 decimals under 1 — so small
 * amounts like 0.7 g or 0.25 ml keep their precision instead of collapsing to 0/1.
 * Countable units get vulgar fractions: 1.5 onion renders as 1½.
 */
export function formatAmount(n: number, unit?: string): string {
  if (unit && WHOLE_UNITS.has(unit)) {
    const abs = Math.abs(n);
    const decimals = abs < 1 ? 2 : abs < 10 ? 1 : 0;
    const factor = 10 ** decimals;
    return String(Math.round(n * factor) / factor);
  }
  // Only when the unit is known — an omitted unit could be anything.
  if (unit !== undefined && COUNT_UNITS.has(unit)) return formatCountable(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

/** Format a currency value — always 2 decimal places, no trailing-zero issue. */
export function formatCurrency(n: number): string {
  return n.toFixed(2);
}

/**
 * Clean a number for use in an input field value — strips trailing .0 but
 * preserves meaningful decimals like .5.
 */
export function formatInputValue(n: number | null | undefined): string {
  if (n == null) return "";
  const v = Number(n);
  if (v % 1 === 0) return v.toFixed(0);
  return String(v);
}
