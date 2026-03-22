const WHOLE_UNITS = new Set([
  "g",
  "mg",
  "ml",
  "cl",
  "dl",
  "mm",
  "pcs",
  "slice",
  "clove",
  "bunch",
  "sprig",
  "pinch",
  "dash",
]);

/**
 * Format a numeric amount for display — never shows unnecessary trailing zeros.
 * Rounds to 1 decimal place max. Whole units (g, ml, pcs…) always round to integer.
 */
export function formatAmount(n: number, unit?: string): string {
  if (unit && WHOLE_UNITS.has(unit)) {
    return Math.round(n).toString();
  }
  const rounded = Math.round(n * 10) / 10;
  if (rounded % 1 === 0) return rounded.toFixed(0);
  return rounded.toFixed(1);
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
