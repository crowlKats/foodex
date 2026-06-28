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
 * Rounds to 2 decimal places max. Fine-grained metric units (g, ml…) round by
 * magnitude: integer at 10+, 1 decimal under 10, 2 decimals under 1 — so small
 * amounts like 0.7 g or 0.25 ml keep their precision instead of collapsing to 0/1.
 */
export function formatAmount(n: number, unit?: string): string {
  if (unit && WHOLE_UNITS.has(unit)) {
    const abs = Math.abs(n);
    const decimals = abs < 1 ? 2 : abs < 10 ? 1 : 0;
    const factor = 10 ** decimals;
    return String(Math.round(n * factor) / factor);
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
