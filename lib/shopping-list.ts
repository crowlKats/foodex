/**
 * The shopping list, computed rather than stored.
 *
 *   list = (planned meals + manual demands) − pantry stock − already bought
 *
 * Nothing here is persisted as a line. Demand rows and purchases are, and the
 * lines fall out of them on every load, which is why changing the servings of a
 * planned meal or buying half the flour immediately produces the right list.
 */
import type { QueryFn } from "../db/mod.ts";
import { ensureIngredientIds } from "./ingredient-resolve.ts";
import {
  computeAvailability,
  type IngredientRef,
  matchKey,
  type StockRow,
} from "./inventory.ts";
import {
  addStock,
  loadStock,
  reverseSource,
  type StockItem,
} from "./pantry.ts";
import { convertAmount, toBaseUnit } from "./unit-convert.ts";

/** Where a line's requirement came from. */
export interface DemandSource {
  kind: "plan" | "manual";
  /** plan_entries.id or shopping_list_demands.id */
  id: string;
  label: string;
  /** Recipe slug, for plan-sourced demand. */
  slug?: string | null;
  planned_for?: string | null;
}

export interface Demand {
  source: DemandSource;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  density?: number | null;
  /** Recipe scale for plan-sourced demand. */
  scale?: number;
}

export interface Purchase {
  id: string;
  match_key: string;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  store_id: string | null;
  price: number | null;
  expires_at: string | null;
}

export interface ShoppingLine {
  key: string;
  ingredient_id: string | null;
  name: string;
  /** Amount to buy: total demand minus what's on hand. */
  needed: number | null;
  unit: string | null;
  /** Everything the plan and manual entries asked for, before stock. */
  required: number | null;
  /** Stock counted against the requirement. */
  have: number;
  /** Stock exists but its amount isn't tracked, so `needed` may overstate. */
  quantityUnknown: boolean;
  /** A demand or a stock row used an incompatible unit and was left out. */
  unconvertible: boolean;
  /** Covered by a staple: shown, but never demanded. */
  staple: boolean;
  sources: (DemandSource & { amount: number | null; unit: string | null })[];
  /** Set once someone ticks the line off. Its presence *is* "checked". */
  purchase: Purchase | null;
  store_id: string | null;
}

export interface ProjectOptions {
  /** household_ingredient_stores, keyed by ingredient id. */
  storePreferences?: Map<string, string>;
  /** Cheapest store per ingredient, used when there's no preference. */
  fallbackStores?: Map<string, string>;
}

/**
 * Fold demand against stock into the lines to actually buy.
 *
 * Pure so the arithmetic is testable without a database; the shape of a
 * shopping list is exactly the kind of thing that should never need one.
 */
export function projectLines(
  demands: readonly Demand[],
  stock: readonly StockRow[],
  purchases: readonly Purchase[],
  opts: ProjectOptions = {},
): ShoppingLine[] {
  const groups = new Map<string, Demand[]>();
  for (const demand of demands) {
    const key = matchKey(demand);
    const existing = groups.get(key);
    if (existing) existing.push(demand);
    else groups.set(key, [demand]);
  }

  const purchaseByKey = new Map(purchases.map((p) => [p.match_key, p]));
  const lines: ShoppingLine[] = [];

  for (const [key, group] of groups) {
    // Total in the unit of the demand that asks for the most, so a recipe
    // wanting 1 kg and another wanting 200 g report as one kilo-scale line.
    const unit = dominantUnit(group);
    const density = group.find((d) => d.density != null)?.density ?? null;

    let required: number | null = null;
    let unconvertible = false;
    const sources: ShoppingLine["sources"] = [];

    for (const demand of group) {
      const scaled = demand.amount != null
        ? demand.amount * (demand.scale ?? 1)
        : null;
      sources.push({ ...demand.source, amount: scaled, unit: demand.unit });
      if (scaled == null) continue;

      const demandUnit = demand.unit || "";
      if (demandUnit === unit) {
        required = (required ?? 0) + scaled;
        continue;
      }
      const converted = convertAmount(scaled, demandUnit, unit, density);
      if (converted == null) unconvertible = true;
      else required = (required ?? 0) + converted;
    }

    const ref: IngredientRef = {
      ingredient_id: group[0].ingredient_id,
      name: group[0].name,
      amount: required,
      unit,
      density,
    };
    const availability = computeAvailability(ref, stock);
    const purchase = purchaseByKey.get(key) ?? null;

    // Nothing to buy and nothing bought: the pantry already covers it.
    if (
      !purchase && availability.needed === 0 && !availability.quantityUnknown
    ) {
      continue;
    }

    lines.push({
      key,
      ingredient_id: group[0].ingredient_id,
      name: group[0].name,
      needed: availability.needed,
      unit,
      required,
      have: availability.have,
      quantityUnknown: availability.quantityUnknown,
      unconvertible: unconvertible || availability.unconvertible,
      staple: availability.staple,
      sources,
      purchase,
      store_id: resolveStore(group[0].ingredient_id, purchase, opts),
    });
  }

  // Lines already bought sink to the bottom; the rest sort by name.
  return lines.sort((a, b) => {
    if (!!a.purchase !== !!b.purchase) return a.purchase ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The unit of the largest single requirement in a group, compared in base
 * units: 1 kg outranks 200 g, even though 200 is the bigger number.
 */
function dominantUnit(group: readonly Demand[]): string {
  let best = "";
  let bestSize = -1;
  for (const demand of group) {
    if (!demand.unit) continue;
    const scaled = (demand.amount ?? 0) * (demand.scale ?? 1);
    const size = toBaseUnit(scaled, demand.unit).amount;
    if (size > bestSize) {
      bestSize = size;
      best = demand.unit;
    }
  }
  return best;
}

function resolveStore(
  ingredientId: string | null,
  purchase: Purchase | null,
  opts: ProjectOptions,
): string | null {
  if (purchase?.store_id) return purchase.store_id;
  if (!ingredientId) return null;
  return opts.storePreferences?.get(ingredientId) ??
    opts.fallbackStores?.get(ingredientId) ?? null;
}

// ── Loading ────────────────────────────────────────────────────────────────

/** The household's single shopping list, created on first use. */
export async function getOrCreateList(
  db: { query: QueryFn },
  householdId: string,
): Promise<{ id: string; share_token: string | null }> {
  const existing = await db.query<{ id: string; share_token: string | null }>(
    "SELECT id, share_token FROM shopping_lists WHERE household_id = $1",
    [householdId],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await db.query<{ id: string; share_token: string | null }>(
    `INSERT INTO shopping_lists (household_id) VALUES ($1)
     ON CONFLICT (household_id) DO UPDATE SET household_id = EXCLUDED.household_id
     RETURNING id, share_token`,
    [householdId],
  );
  return created.rows[0];
}

/** Outstanding demand: planned meals expanded to ingredients, plus manual rows. */
export async function loadDemands(
  db: { query: QueryFn },
  householdId: string,
  listId: string,
): Promise<Demand[]> {
  const [planRes, manualRes] = await Promise.all([
    db.query<{
      entry_id: string;
      scale: number;
      title: string;
      slug: string;
      planned_for: string | null;
      ingredient_id: string | null;
      name: string;
      amount: number | null;
      unit: string | null;
      density: number | null;
    }>(
      `SELECT pe.id as entry_id, pe.scale, pe.planned_for::text as planned_for,
              r.title, r.slug,
              ri.ingredient_id, ri.name, ri.amount, ri.unit, g.density
       FROM plan_entries pe
       JOIN recipes r ON r.id = pe.recipe_id
       JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE pe.household_id = $1
         AND pe.status = 'planned'
         AND pe.include_in_list = true
         -- Water and the like scale with the recipe but are never bought.
         AND NOT ri.intermediate
         AND NOT COALESCE(g.always_on_hand, false)
       ORDER BY pe.planned_for NULLS LAST, ri.sort_order`,
      [householdId],
    ),
    db.query<{
      id: string;
      ingredient_id: string | null;
      name: string;
      amount: number | null;
      unit: string | null;
      note: string | null;
      density: number | null;
    }>(
      `SELECT d.id, d.ingredient_id, d.name, d.amount, d.unit, d.note, g.density
       FROM shopping_list_demands d
       LEFT JOIN ingredients g ON g.id = d.ingredient_id
       WHERE d.shopping_list_id = $1
       ORDER BY d.created_at`,
      [listId],
    ),
  ]);

  const demands: Demand[] = planRes.rows.map((row) => ({
    source: {
      kind: "plan",
      id: row.entry_id,
      label: row.title,
      slug: row.slug,
      planned_for: row.planned_for,
    },
    ingredient_id: row.ingredient_id,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    density: row.density,
    scale: Number(row.scale) || 1,
  }));

  for (const row of manualRes.rows) {
    demands.push({
      source: {
        kind: "manual",
        id: row.id,
        label: row.note ?? "Added by hand",
      },
      ingredient_id: row.ingredient_id,
      name: row.name,
      amount: row.amount,
      unit: row.unit,
      density: row.density,
    });
  }

  return demands;
}

export async function loadPurchases(
  db: { query: QueryFn },
  listId: string,
): Promise<Purchase[]> {
  const res = await db.query<Purchase>(
    `SELECT id, match_key, ingredient_id, name, amount, unit, store_id, price,
            expires_at::text as expires_at
     FROM shopping_list_purchases
     WHERE shopping_list_id = $1
     ORDER BY created_at`,
    [listId],
  );
  return res.rows;
}

export interface ProjectedList {
  listId: string;
  shareToken: string | null;
  lines: ShoppingLine[];
  stock: StockItem[];
}

/** Everything the shopping list page needs, in one call. */
export async function projectShoppingList(
  db: { query: QueryFn },
  householdId: string,
): Promise<ProjectedList> {
  const list = await getOrCreateList(db, householdId);
  const [demands, purchases, stock, storePrefs] = await Promise.all([
    loadDemands(db, householdId, list.id),
    loadPurchases(db, list.id),
    loadStock(db, householdId),
    loadStorePreferences(db, householdId),
  ]);

  const ingredientIds = [
    ...new Set(
      demands.map((d) => d.ingredient_id).filter((id): id is string =>
        id != null
      ),
    ),
  ];
  const fallbackStores = await loadCheapestStores(
    db,
    householdId,
    ingredientIds,
  );

  return {
    listId: list.id,
    shareToken: list.share_token,
    lines: projectLines(demands, stock, purchases, {
      storePreferences: storePrefs,
      fallbackStores,
    }),
    stock,
  };
}

// ── Buying ────────────────────────────────────────────────────────────────

/**
 * Tick a line off: record the purchase, then book the stock into the pantry
 * against that purchase's id.
 *
 * The purchase row is the "checked" state *and* the idempotency key. Checking
 * the same line twice inserts nothing the second time, and un-checking reverses
 * exactly what was added; the old flag-based version double-counted stock
 * every time someone un-checked and re-checked an item.
 */
export async function buyLine(
  db: { query: QueryFn },
  opts: {
    listId: string;
    householdId: string;
    matchKey: string;
    ingredientId?: string | null;
    name: string;
    amount?: number | null;
    unit?: string | null;
    storeId?: string | null;
    price?: number | null;
    expiresAt?: string | null;
    userId?: string | null;
  },
): Promise<{ ok: boolean; purchaseId: string | null }> {
  // Purchases always link to a real ingredient (migration 068). addStock
  // below resolves too, but the purchase row itself needs the id.
  const link = {
    name: opts.name,
    ingredient_id: opts.ingredientId ?? null,
    unit: opts.unit ?? null,
  };
  await ensureIngredientIds(db.query, [link]);
  const ingredientId = link.ingredient_id ?? null;

  const purchase = await db.query<{ id: string }>(
    `INSERT INTO shopping_list_purchases (
       shopping_list_id, match_key, ingredient_id, name, amount, unit,
       store_id, price, expires_at, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (shopping_list_id, match_key) DO NOTHING
     RETURNING id`,
    [
      opts.listId,
      opts.matchKey,
      ingredientId,
      opts.name,
      opts.amount ?? null,
      opts.unit ?? null,
      opts.storeId ?? null,
      opts.price ?? null,
      opts.expiresAt ?? null,
      opts.userId ?? null,
    ],
  );
  if (purchase.rows.length === 0) return { ok: true, purchaseId: null };

  const purchaseId = purchase.rows[0].id;
  await addStock(db, {
    householdId: opts.householdId,
    ingredientId,
    name: opts.name,
    amount: opts.amount ?? null,
    unit: opts.unit ?? null,
    kind: "bought",
    source: { type: "shopping_list_purchase", id: purchaseId },
    storeId: opts.storeId ?? null,
    unitPrice: opts.price ?? null,
    expiresAt: opts.expiresAt ?? null,
    note: "Bought from the shopping list",
    userId: opts.userId ?? null,
  });

  return { ok: true, purchaseId };
}

/** Un-tick a line: take the stock back out and forget the purchase. */
export async function unbuyLine(
  db: { query: QueryFn },
  opts: { listId: string; householdId: string; matchKey: string },
): Promise<boolean> {
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM shopping_list_purchases WHERE shopping_list_id = $1 AND match_key = $2",
    [opts.listId, opts.matchKey],
  );
  if (existing.rows.length === 0) return false;
  const purchaseId = existing.rows[0].id;

  await reverseSource(db, opts.householdId, {
    type: "shopping_list_purchase",
    id: purchaseId,
  });
  await db.query("DELETE FROM shopping_list_purchases WHERE id = $1", [
    purchaseId,
  ]);
  return true;
}

/**
 * How many lines are still outstanding, for the nav badge.
 *
 * Deliberately a single query rather than a full projection: this runs on every
 * authenticated request. It compares in base units and skips density bridging,
 * so it can differ from the rendered list by an ingredient whose stock is
 * measured by volume and whose recipe asks for it by weight.
 */
export async function countOutstandingLines(
  db: { query: QueryFn },
  householdId: string,
): Promise<number> {
  const res = await db.query<{ count: number }>(
    `WITH demand AS (
       SELECT fx_match_key(ri.ingredient_id, ri.name) AS k,
              fx_base_unit(ri.unit) AS bu,
              SUM(fx_base_amount(COALESCE(ri.amount, 0) * pe.scale, ri.unit)) AS amt
       FROM plan_entries pe
       JOIN recipe_ingredients ri ON ri.recipe_id = pe.recipe_id
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE pe.household_id = $1
         AND pe.status = 'planned'
         AND pe.include_in_list = true
         AND NOT ri.intermediate
         AND NOT COALESCE(g.always_on_hand, false)
       GROUP BY 1, 2
       UNION ALL
       SELECT fx_match_key(d.ingredient_id, d.name),
              fx_base_unit(d.unit),
              SUM(fx_base_amount(COALESCE(d.amount, 0), d.unit))
       FROM shopping_list_demands d
       JOIN shopping_lists sl ON sl.id = d.shopping_list_id
       WHERE sl.household_id = $1
       GROUP BY 1, 2
     ),
     demand_total AS (
       SELECT k, bu, SUM(amt) AS amt FROM demand GROUP BY k, bu
     ),
     stock_amounts AS (
       SELECT fx_match_key(pi.ingredient_id, pi.name) AS k,
              fx_base_unit(pi.unit) AS bu,
              SUM(fx_base_amount(COALESCE(pi.amount, 0), pi.unit)) AS amt
       FROM pantry_items pi
       WHERE pi.household_id = $1
       GROUP BY 1, 2
     ),
     -- Keyed on the ingredient alone, not the unit: a staple usually has no
     -- unit at all, and would never join against a demand measured in grams.
     stock_flags AS (
       SELECT fx_match_key(pi.ingredient_id, pi.name) AS k,
              BOOL_OR(pi.staple OR pi.amount IS NULL) AS unlimited
       FROM pantry_items pi
       WHERE pi.household_id = $1
       GROUP BY 1
     )
     SELECT COUNT(*)::int AS count
     FROM demand_total dt
     LEFT JOIN stock_flags sf ON sf.k = dt.k
     LEFT JOIN stock_amounts sa ON sa.k = dt.k AND sa.bu = dt.bu
     WHERE NOT COALESCE(sf.unlimited, false)
       AND dt.amt > COALESCE(sa.amt, 0)
       AND NOT EXISTS (
         SELECT 1 FROM shopping_list_purchases p
         JOIN shopping_lists sl2 ON sl2.id = p.shopping_list_id
         WHERE sl2.household_id = $1 AND p.match_key = dt.k
       )`,
    [householdId],
  );
  return res.rows[0]?.count ?? 0;
}

export async function loadStorePreferences(
  db: { query: QueryFn },
  householdId: string,
): Promise<Map<string, string>> {
  const res = await db.query<{ ingredient_id: string; store_id: string }>(
    "SELECT ingredient_id, store_id FROM household_ingredient_stores WHERE household_id = $1",
    [householdId],
  );
  return new Map(res.rows.map((r) => [r.ingredient_id, r.store_id]));
}

/** Cheapest store per ingredient among the stores the household shops at. */
export async function loadCheapestStores(
  db: { query: QueryFn },
  householdId: string,
  ingredientIds: string[],
): Promise<Map<string, string>> {
  if (ingredientIds.length === 0) return new Map();
  const res = await db.query<{ ingredient_id: string; store_id: string }>(
    `SELECT DISTINCT ON (gp.ingredient_id) gp.ingredient_id, gp.store_id
     FROM ingredient_prices gp
     JOIN household_stores hs ON hs.store_id = gp.store_id AND hs.household_id = $1
     WHERE gp.ingredient_id = ANY($2)
     ORDER BY gp.ingredient_id, gp.price ASC`,
    [householdId, ingredientIds],
  );
  return new Map(res.rows.map((r) => [r.ingredient_id, r.store_id]));
}
