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
 * Format a numeric amount for display — never shows unnecessary trailing zeros.
 * Rounds to 2 decimal places max. Fine-grained metric units (g, ml…) round to integer.
 */
export function formatAmount(n: number, unit?: string): string {
  if (unit && WHOLE_UNITS.has(unit)) {
    return Math.round(n).toString();
  }
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
