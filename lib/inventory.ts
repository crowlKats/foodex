/**
 * Canonical answers to "do we have this ingredient, and how much is missing?".
 *
 * Every surface that compares a recipe ingredient against household stock goes
 * through this module: the recipe view badge and its shopping-list button, the
 * pantry deduction endpoint, the shopping list projection, the pantry merge UI
 * and the agent's kitchen tools. Before this existed each of those answered the
 * question slightly differently, so the same page could claim both "all
 * ingredients in pantry" and "400 g still needed".
 *
 * The SQL mirror of these rules lives in `db/migrations/056_inventory_units.sql`
 * (`fx_base_amount` / `fx_base_unit`), used where a filter has to run in the
 * database. Keep the two in sync.
 */
import { convertAmount } from "./unit-convert.ts";

/** A row of household stock: a `pantry_items` row, or anything shaped like one. */
export interface StockRow {
  id?: string;
  ingredient_id?: string | null;
  name: string;
  amount?: number | null;
  unit?: string | null;
  expires_at?: string | null;
  /** Always-on-hand items (salt, water, oil) count as available in any amount. */
  staple?: boolean | null;
  /** Density of the linked ingredient, for mass↔volume conversion. */
  density?: number | null;
}

/** Something we need: a recipe ingredient, a manual list entry, a deduction. */
export interface IngredientRef {
  ingredient_id?: string | null;
  name: string;
  amount?: number | null;
  unit?: string | null;
  density?: number | null;
}

/**
 * Identity used to decide whether two rows are "the same thing".
 *
 * A linked ingredient wins over the name: two rows pointing at the same
 * ingredient entity are the same thing even if one says "Flour" and the other
 * "flour, plain". Unlinked rows fall back to their normalized name, which is
 * why linking matters: it is the only identity that survives a rename.
 */
export function matchKey(ref: IngredientRef | StockRow): string {
  if (ref.ingredient_id) return `id:${ref.ingredient_id}`;
  return `name:${normalizeName(ref.name)}`;
}

/** Lowercase, trim, and collapse internal whitespace. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when a stock row represents the same ingredient as the reference. */
export function stockMatches(ref: IngredientRef, row: StockRow): boolean {
  if (ref.ingredient_id && row.ingredient_id) {
    return ref.ingredient_id === row.ingredient_id;
  }
  return normalizeName(ref.name) === normalizeName(row.name);
}

/**
 * Stock rows for a reference, soonest-expiring first.
 *
 * Rows linked by ingredient id take precedence: if any exist, name-only matches
 * are ignored rather than double-counted alongside them.
 */
export function selectStock<T extends StockRow>(
  ref: IngredientRef,
  rows: readonly T[],
): T[] {
  let matches: T[] = [];
  if (ref.ingredient_id) {
    matches = rows.filter((r) => r.ingredient_id === ref.ingredient_id);
  }
  if (matches.length === 0) {
    const wanted = normalizeName(ref.name);
    matches = rows.filter((r) => normalizeName(r.name) === wanted);
  }
  return [...matches].sort(compareByExpiry);
}

/** Soonest-expiring first; undated stock last (use up the perishable things). */
export function compareByExpiry(a: StockRow, b: StockRow): number {
  const ax = a.expires_at ?? null;
  const bx = b.expires_at ?? null;
  if (ax === bx) return 0;
  if (ax == null) return 1;
  if (bx == null) return -1;
  return ax < bx ? -1 : 1;
}

export interface Availability {
  /** Stock on hand expressed in the reference's unit. */
  have: number;
  /** Still required after stock and committed purchases. Null when untracked. */
  needed: number | null;
  /** The scaled amount the reference asked for. Null when it has no amount. */
  required: number | null;
  /** At least one stock row matched, regardless of amounts. */
  present: boolean;
  /** Covered by a staple; treated as unlimited. */
  staple: boolean;
  /** A matching row had no amount recorded, so `have` understates reality. */
  quantityUnknown: boolean;
  /** A matching row's unit could not be converted and was left out of `have`. */
  unconvertible: boolean;
}

export interface AvailabilityOptions {
  /** Recipe scale factor applied to the reference amount. */
  scale?: number;
  /**
   * Stock already spoken for by other demands: another planned meal, or an
   * earlier line on the shopping list. Subtracted from what's on hand so the
   * same 200 g of flour is never credited to two meals at once.
   */
  claimed?: number;
}

/** Availability of `ref` against `rows`. The one function that decides. */
export function computeAvailability(
  ref: IngredientRef,
  rows: readonly StockRow[],
  opts: AvailabilityOptions = {},
): Availability {
  const scale = opts.scale ?? 1;
  const matches = selectStock(ref, rows);
  const required = ref.amount != null ? ref.amount * scale : null;

  const result: Availability = {
    have: 0,
    needed: required,
    required,
    present: matches.length > 0,
    staple: matches.some((m) => m.staple === true),
    quantityUnknown: false,
    unconvertible: false,
  };

  if (result.staple) {
    result.needed = 0;
    return result;
  }

  const refUnit = ref.unit || "";
  for (const row of matches) {
    if (row.amount == null) {
      result.quantityUnknown = true;
      continue;
    }
    const rowUnit = row.unit || "";
    if (rowUnit === refUnit) {
      result.have += row.amount;
      continue;
    }
    const converted = convertAmount(
      row.amount,
      rowUnit,
      refUnit,
      row.density ?? ref.density,
    );
    if (converted == null) {
      result.unconvertible = true;
    } else {
      result.have += converted;
    }
  }

  if (required != null) {
    const unclaimed = Math.max(0, result.have - (opts.claimed ?? 0));
    result.needed = Math.max(0, required - unclaimed);
  }

  return result;
}

/**
 * Whether an ingredient counts as "we have this" for at-a-glance summaries:
 * the recipe badge and the cookable filter.
 *
 * Deliberately amount-aware: a matched row with a known amount that falls short
 * is *not* available. Rows with no amount recorded count as available, since
 * "some flour, quantity untracked" is the normal state of a real pantry.
 */
export function isAvailable(availability: Availability): boolean {
  if (!availability.present) return false;
  if (availability.staple) return true;
  if (availability.needed == null) return true;
  if (availability.needed === 0) return true;
  // Short on a tracked amount. Only counts if some matching row was untracked,
  // in which case the shortfall is an artefact of missing data, not of stock.
  return availability.quantityUnknown;
}

/** Group rows that refer to the same ingredient, keyed by {@link matchKey}. */
export function groupByIngredient<T extends StockRow>(
  rows: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = matchKey(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Other rows representing the same ingredient: merge candidates. */
export function findDuplicates<T extends StockRow>(
  row: T,
  rows: readonly T[],
): T[] {
  const key = matchKey(row);
  return rows.filter((other) => other !== row && matchKey(other) === key);
}

export interface SummedAmount {
  amount: number | null;
  unit: string;
  /** Some row could not be converted into `unit` and was excluded. */
  unconvertible: boolean;
  /** Some row had no amount recorded. */
  quantityUnknown: boolean;
}

/**
 * Total a set of rows into one unit: the unit of the largest contributor, so
 * "500 g + 0.5 kg" reports as one kilogram rather than two separate lines.
 */
export function sumAmounts(
  rows: readonly StockRow[],
  preferredUnit?: string | null,
): SummedAmount {
  const unit = preferredUnit ?? rows.find((r) => r.unit)?.unit ?? "";
  const result: SummedAmount = {
    amount: null,
    unit,
    unconvertible: false,
    quantityUnknown: false,
  };

  for (const row of rows) {
    if (row.amount == null) {
      result.quantityUnknown = true;
      continue;
    }
    const rowUnit = row.unit || "";
    if (rowUnit === unit) {
      result.amount = (result.amount ?? 0) + row.amount;
      continue;
    }
    const converted = convertAmount(row.amount, rowUnit, unit, row.density);
    if (converted == null) result.unconvertible = true;
    else result.amount = (result.amount ?? 0) + converted;
  }

  return result;
}

/**
 * Split a required amount across stock rows, soonest-expiring first.
 *
 * Returns one instruction per row it draws from plus whatever it could not
 * cover, so callers can record the shortfall instead of silently under-deducting.
 */
export interface Consumption {
  row: StockRow;
  /** Amount to remove, in the row's own unit. */
  amountInRowUnit: number;
  /** Whether this empties the row. */
  exhausted: boolean;
}

export interface ConsumptionPlan {
  consumptions: Consumption[];
  /** Amount left unaccounted for, in the reference's unit. */
  shortfall: number;
  /** Rows that matched but whose unit could not be reconciled. */
  skipped: StockRow[];
}

export function planConsumption(
  ref: IngredientRef,
  rows: readonly StockRow[],
  opts: { scale?: number } = {},
): ConsumptionPlan {
  const scale = opts.scale ?? 1;
  const plan: ConsumptionPlan = {
    consumptions: [],
    shortfall: 0,
    skipped: [],
  };
  if (ref.amount == null) return plan;

  let remaining = ref.amount * scale;
  if (remaining <= 0) return plan;

  const refUnit = ref.unit || "";
  for (const row of selectStock(ref, rows)) {
    if (remaining <= 0) break;
    if (row.staple) {
      // Staples are unlimited by definition; nothing to deduct.
      remaining = 0;
      break;
    }
    if (row.amount == null || row.amount <= 0) continue;

    const rowUnit = row.unit || "";
    const density = row.density ?? ref.density;
    // How much of `remaining` this row can cover, in the row's unit.
    const remainingInRowUnit = rowUnit === refUnit
      ? remaining
      : convertAmount(remaining, refUnit, rowUnit, density);
    if (remainingInRowUnit == null) {
      plan.skipped.push(row);
      continue;
    }

    const take = Math.min(row.amount, remainingInRowUnit);
    plan.consumptions.push({
      row,
      amountInRowUnit: take,
      exhausted: take >= row.amount,
    });

    const takenInRefUnit = rowUnit === refUnit
      ? take
      : convertAmount(take, rowUnit, refUnit, density);
    remaining -= takenInRefUnit ?? remaining;
  }

  plan.shortfall = Math.max(0, remaining);
  return plan;
}
