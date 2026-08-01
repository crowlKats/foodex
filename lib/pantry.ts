/**
 * The only writer of household stock.
 *
 * Every change records *why* it happened in `pantry_transactions` and then
 * moves the `pantry_items` balance to match. Callers never UPDATE a balance
 * directly — going through here is what makes buying idempotent, cooking
 * reversible, and "where did the milk go" answerable.
 */
import type { QueryFn } from "../db/mod.ts";
import {
  computeAvailability,
  type IngredientRef,
  matchKey,
  normalizeName,
  planConsumption,
  type StockRow,
} from "./inventory.ts";
import { convertAmount } from "./unit-convert.ts";

/** Amounts below this are rounding residue from unit conversion, not stock. */
const EPSILON = 0.0005;

export type TransactionKind =
  | "bought"
  | "cooked"
  | "wasted"
  | "adjusted"
  | "produced";

export type SourceType =
  | "shopping_list_purchase"
  | "plan_entry"
  | "scan"
  | "manual"
  | "opening_balance";

export interface Source {
  type: SourceType;
  id: string;
}

/** A pantry row plus the linked ingredient's density, ready for matching. */
export interface StockItem extends StockRow {
  id: string;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  expires_at: string | null;
  staple: boolean;
  density: number | null;
}

/** Current balances for a household, densities included. */
export async function loadStock(
  db: { query: QueryFn },
  householdId: string,
): Promise<StockItem[]> {
  const res = await db.query<StockItem>(
    `SELECT pi.id, pi.ingredient_id, pi.name, pi.amount, pi.unit,
            pi.expires_at::text as expires_at, pi.staple, g.density
     FROM pantry_items pi
     LEFT JOIN ingredients g ON g.id = pi.ingredient_id
     WHERE pi.household_id = $1
     ORDER BY pi.name`,
    [householdId],
  );
  return res.rows;
}

export interface AddStockInput {
  householdId: string;
  ingredientId?: string | null;
  name: string;
  amount?: number | null;
  unit?: string | null;
  kind?: TransactionKind;
  source?: Source | null;
  /**
   * Distinguishes several additions sharing one source. Cooking a plan entry
   * consumes at seq 0+ and books the recipe's own output at -1, so the two
   * don't collide on the source uniqueness index.
   */
  sourceSeq?: number;
  storeId?: string | null;
  unitPrice?: number | null;
  expiresAt?: string | null;
  staple?: boolean;
  note?: string | null;
  userId?: string | null;
}

export interface AddStockResult {
  /** False when this source was already recorded — the caller's retry is a no-op. */
  applied: boolean;
  pantryItemId: string | null;
  transactionId: string | null;
}

/**
 * Add stock to the pantry.
 *
 * Merges into an existing balance row only when it is unambiguous: same
 * ingredient identity, same unit, same best-before date. Stock with a different
 * expiry gets its own row, because folding a fresh carton into an old one
 * silently moves the expiry date of everything you own.
 */
export async function addStock(
  db: { query: QueryFn },
  input: AddStockInput,
): Promise<AddStockResult> {
  const kind = input.kind ?? "bought";
  const amount = input.amount ?? null;
  const unit = input.unit ?? null;
  const expiresAt = input.expiresAt ?? null;

  const tx = await db.query<{ id: string }>(
    `INSERT INTO pantry_transactions (
       household_id, ingredient_id, name, amount, unit, kind,
       source_type, source_id, source_seq, store_id, unit_price, expires_at,
       note, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (source_type, source_id, source_seq) WHERE source_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      input.householdId,
      input.ingredientId ?? null,
      input.name,
      amount,
      unit,
      kind,
      input.source?.type ?? null,
      input.source?.id ?? null,
      input.sourceSeq ?? 0,
      input.storeId ?? null,
      input.unitPrice ?? null,
      expiresAt,
      input.note ?? null,
      input.userId ?? null,
    ],
  );

  if (tx.rows.length === 0) {
    // Already recorded under this source: the stock is in, nothing to do.
    return { applied: false, pantryItemId: null, transactionId: null };
  }
  const transactionId = tx.rows[0].id;

  const stock = await loadStock(db, input.householdId);
  const ref: IngredientRef = {
    ingredient_id: input.ingredientId ?? null,
    name: input.name,
    unit,
  };
  const target = stock.find((row) =>
    matchKey(row) === matchKey(ref) &&
    (row.unit ?? null) === unit &&
    (row.expires_at ?? null) === expiresAt
  );

  let pantryItemId: string;
  if (target) {
    const newAmount = amount == null
      ? target.amount
      : (target.amount ?? 0) + amount;
    await db.query(
      `UPDATE pantry_items
       SET amount = $1, staple = staple OR $2, updated_at = now()
       WHERE id = $3`,
      [newAmount, input.staple ?? false, target.id],
    );
    pantryItemId = target.id;
  } else {
    const created = await db.query<{ id: string }>(
      `INSERT INTO pantry_items (
         household_id, ingredient_id, name, amount, unit, expires_at, staple
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.householdId,
        input.ingredientId ?? null,
        input.name,
        amount,
        unit,
        expiresAt,
        input.staple ?? false,
      ],
    );
    pantryItemId = created.rows[0].id;
  }

  await db.query(
    "UPDATE pantry_transactions SET pantry_item_id = $1 WHERE id = $2",
    [pantryItemId, transactionId],
  );

  return { applied: true, pantryItemId, transactionId };
}

export interface ConsumeShortfall {
  name: string;
  ingredient_id: string | null;
  /** Amount that was needed but not in stock, in the reference's unit. */
  missing: number;
  unit: string | null;
  /** True when stock existed but its unit could not be reconciled. */
  unconvertible: boolean;
}

export interface ConsumeResult {
  applied: boolean;
  shortfalls: ConsumeShortfall[];
}

export interface ConsumeInput {
  householdId: string;
  refs: IngredientRef[];
  scale?: number;
  kind?: TransactionKind;
  source?: Source | null;
  note?: string | null;
  userId?: string | null;
}

/**
 * Draw ingredients out of the pantry, soonest-expiring first.
 *
 * Returns whatever it could not cover instead of silently under-deducting, so
 * the caller can tell the user "you were 200 g short" rather than quietly
 * pretending the recipe was fully stocked.
 */
export async function consumeStock(
  db: { query: QueryFn },
  input: ConsumeInput,
): Promise<ConsumeResult> {
  const kind = input.kind ?? "cooked";

  if (input.source) {
    // A marker row (seq 0) claims the source, so a double submit deducts once.
    const claim = await db.query<{ id: string }>(
      `INSERT INTO pantry_transactions (
         household_id, name, amount, unit, kind,
         source_type, source_id, source_seq, note, created_by
       )
       VALUES ($1, $2, NULL, NULL, $3, $4, $5, 0, $6, $7)
       ON CONFLICT (source_type, source_id, source_seq) WHERE source_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        input.householdId,
        input.note ?? "Consumption",
        kind,
        input.source.type,
        input.source.id,
        input.note ?? null,
        input.userId ?? null,
      ],
    );
    if (claim.rows.length === 0) return { applied: false, shortfalls: [] };
  }

  const stock = await loadStock(db, input.householdId);
  const shortfalls: ConsumeShortfall[] = [];
  // Live balances for this call, so two refs drawing on the same row (or a
  // scaled repeat of one recipe) cannot both spend it.
  const remainingById = new Map<string, number | null>(
    stock.map((row) => [row.id, row.amount]),
  );
  let seq = 1;

  for (const ref of input.refs) {
    if (ref.amount == null) continue;
    const available = stock.map((row) => ({
      ...row,
      amount: remainingById.get(row.id) ?? null,
    }));

    const plan = planConsumption(ref, available, { scale: input.scale });

    for (const consumption of plan.consumptions) {
      const rowId = consumption.row.id as string;
      const before = remainingById.get(rowId) ?? 0;
      const after = before - consumption.amountInRowUnit;
      remainingById.set(rowId, after);

      await db.query(
        `INSERT INTO pantry_transactions (
           household_id, pantry_item_id, ingredient_id, name, amount, unit,
           kind, source_type, source_id, source_seq, note, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          input.householdId,
          rowId,
          consumption.row.ingredient_id ?? null,
          consumption.row.name,
          -consumption.amountInRowUnit,
          consumption.row.unit ?? null,
          kind,
          input.source?.type ?? null,
          input.source?.id ?? null,
          seq++,
          input.note ?? null,
          input.userId ?? null,
        ],
      );

      if (after <= EPSILON) {
        await db.query("DELETE FROM pantry_items WHERE id = $1", [rowId]);
      } else {
        await db.query(
          "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
          [after, rowId],
        );
      }
    }

    if (plan.shortfall > EPSILON) {
      shortfalls.push({
        name: ref.name,
        ingredient_id: ref.ingredient_id ?? null,
        missing: plan.shortfall,
        unit: ref.unit ?? null,
        unconvertible: plan.skipped.length > 0,
      });
    }
  }

  return { applied: true, shortfalls };
}

/**
 * Undo everything a source did: un-checking a shopping list line takes exactly
 * the amount it added back out, and frees the source so it can be re-applied.
 */
export async function reverseSource(
  db: { query: QueryFn },
  householdId: string,
  source: Source,
): Promise<boolean> {
  const res = await db.query<{
    id: string;
    pantry_item_id: string | null;
    ingredient_id: string | null;
    name: string;
    amount: number | null;
    unit: string | null;
    expires_at: string | null;
  }>(
    `SELECT id, pantry_item_id, ingredient_id, name, amount, unit,
            expires_at::text as expires_at
     FROM pantry_transactions
     WHERE household_id = $1 AND source_type = $2 AND source_id = $3`,
    [householdId, source.type, source.id],
  );
  if (res.rows.length === 0) return false;

  const stock = await loadStock(db, householdId);

  for (const tx of res.rows) {
    if (tx.amount == null) continue;
    // The ledger is signed, so the inverse of a transaction is its negation:
    // this both takes back a purchase and restores what cooking consumed.
    const delta = -tx.amount;

    const row = (tx.pantry_item_id
      ? stock.find((s) =>
        s.id === tx.pantry_item_id
      )
      : undefined) ??
      stock.find((s) =>
        matchKey(s) === matchKey({
            ingredient_id: tx.ingredient_id,
            name: tx.name,
          }) && (s.unit ?? null) === (tx.unit ?? null)
      );

    if (!row) {
      // Cooking emptied the row entirely; un-cooking has to put it back.
      if (delta > EPSILON) {
        await db.query(
          `INSERT INTO pantry_items (
             household_id, ingredient_id, name, amount, unit, expires_at
           )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            householdId,
            tx.ingredient_id,
            tx.name,
            delta,
            tx.unit,
            tx.expires_at,
          ],
        );
      }
      continue;
    }

    const inRowUnit = (row.unit ?? null) === (tx.unit ?? null)
      ? delta
      : convertAmount(delta, tx.unit ?? "", row.unit ?? "", row.density);
    if (inRowUnit == null) continue;

    const remaining = (row.amount ?? 0) + inRowUnit;
    if (remaining <= EPSILON) {
      await db.query("DELETE FROM pantry_items WHERE id = $1", [row.id]);
    } else {
      await db.query(
        "UPDATE pantry_items SET amount = $1, updated_at = now() WHERE id = $2",
        [remaining, row.id],
      );
    }
  }

  await db.query(
    "DELETE FROM pantry_transactions WHERE household_id = $1 AND source_type = $2 AND source_id = $3",
    [householdId, source.type, source.id],
  );
  return true;
}

/** Merge duplicate balance rows into one, keeping the ledger consistent. */
export async function mergeStock(
  db: { query: QueryFn },
  householdId: string,
  targetId: string,
  sourceIds: string[],
): Promise<
  { amount: number | null; unit: string | null; expires_at: string | null }
> {
  const stock = await loadStock(db, householdId);
  const target = stock.find((r) => r.id === targetId);
  if (!target) throw new Error("Target item not found");

  const sources = stock.filter((r) => sourceIds.includes(r.id));
  const targetUnit = target.unit ?? "";
  let total = target.amount;
  // Keep the *soonest* expiry: merged stock is only as good as its oldest part.
  let expiry = target.expires_at;

  for (const src of sources) {
    if (src.amount != null) {
      const srcUnit = src.unit ?? "";
      const converted = srcUnit === targetUnit
        ? src.amount
        : convertAmount(src.amount, srcUnit, targetUnit, src.density);
      if (converted != null) total = (total ?? 0) + converted;
    }
    if (src.expires_at && (!expiry || src.expires_at < expiry)) {
      expiry = src.expires_at;
    }
  }

  await db.query(
    `UPDATE pantry_items SET amount = $1, expires_at = $2, updated_at = now()
     WHERE id = $3 AND household_id = $4`,
    [total, expiry, targetId, householdId],
  );
  await db.query(
    `UPDATE pantry_transactions SET pantry_item_id = $1
     WHERE pantry_item_id = ANY($2) AND household_id = $3`,
    [targetId, sourceIds, householdId],
  );
  await db.query(
    "DELETE FROM pantry_items WHERE id = ANY($1) AND household_id = $2",
    [sourceIds, householdId],
  );

  return { amount: total, unit: target.unit, expires_at: expiry };
}

/**
 * Ingredients the household is running out of soonest — expired or expiring
 * stock, used to seed "use it up" suggestions and the expiry reminder.
 */
export function expiringSoon(
  stock: readonly StockItem[],
  withinDays: number,
  now = new Date(),
): StockItem[] {
  const cutoff = new Date(now.getTime() + withinDays * 86_400_000);
  return stock
    .filter((row) => row.expires_at != null && !row.staple)
    .filter((row) => new Date(row.expires_at as string) <= cutoff)
    .sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""));
}

/** Availability of a set of refs against a household's stock, in one pass. */
export function availabilityFor(
  refs: readonly IngredientRef[],
  stock: readonly StockRow[],
  scale = 1,
) {
  return refs.map((ref) => ({
    ref,
    availability: computeAvailability(ref, stock, { scale }),
  }));
}

/** Stable identity for a projected shopping line. */
export function lineKey(ref: IngredientRef): string {
  return ref.ingredient_id
    ? `id:${ref.ingredient_id}`
    : `name:${normalizeName(ref.name)}`;
}
