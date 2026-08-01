/**
 * Planned meals — the layer both the pantry and the shopping list hang off.
 *
 * A plan entry records the intention ("Pancakes, double batch, Thursday") and
 * survives long enough to be useful: the shopping list reads outstanding
 * entries as demand, and cooking one is the entry's terminal state, which
 * deducts stock through the ledger and leaves a history behind.
 */
import type { QueryFn } from "../db/mod.ts";
import { computeAvailability, type IngredientRef } from "./inventory.ts";
import {
  addStock,
  type ConsumeShortfall,
  consumeStock,
  loadStock,
  reverseSource,
  type StockItem,
} from "./pantry.ts";

export type PlanStatus = "planned" | "cooked" | "skipped";

export interface PlanEntry {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_slug: string;
  cover_image_url: string | null;
  scale: number;
  planned_for: string | null;
  status: PlanStatus;
  include_in_list: boolean;
  note: string | null;
  created_at: string;
  cooked_at: string | null;
}

export interface PlanEntryWithReadiness extends PlanEntry {
  /** Ingredients the pantry can't cover at this scale. */
  missing: { name: string; needed: number | null; unit: string | null }[];
  ingredientCount: number;
  ready: boolean;
}

interface RecipeIngredientRow {
  recipe_id: string;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  density: number | null;
}

/** Plan entries with a per-entry read on whether the pantry can cover them. */
export async function loadPlan(
  db: { query: QueryFn },
  householdId: string,
  opts: { status?: PlanStatus; limit?: number } = {},
): Promise<PlanEntryWithReadiness[]> {
  const status = opts.status ?? "planned";
  const entriesRes = await db.query<PlanEntry>(
    `SELECT pe.id, pe.recipe_id, pe.scale, pe.planned_for::text as planned_for,
            pe.status, pe.include_in_list, pe.note,
            pe.created_at::text as created_at, pe.cooked_at::text as cooked_at,
            r.title as recipe_title, r.slug as recipe_slug,
            m.url as cover_image_url
     FROM plan_entries pe
     JOIN recipes r ON r.id = pe.recipe_id
     LEFT JOIN media m ON m.id = r.cover_image_id
     WHERE pe.household_id = $1 AND pe.status = $2
     ORDER BY
       CASE WHEN pe.status = 'planned' THEN pe.planned_for END NULLS LAST,
       pe.cooked_at DESC NULLS LAST,
       pe.created_at DESC
     LIMIT $3`,
    [householdId, status, opts.limit ?? 100],
  );
  if (entriesRes.rows.length === 0) return [];

  const recipeIds = [...new Set(entriesRes.rows.map((e) => e.recipe_id))];
  const [ingredientsRes, stock] = await Promise.all([
    db.query<RecipeIngredientRow>(
      `SELECT ri.recipe_id, ri.ingredient_id, ri.name, ri.amount, ri.unit,
              g.density
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = ANY($1)
       ORDER BY ri.sort_order`,
      [recipeIds],
    ),
    loadStock(db, householdId),
  ]);

  const byRecipe = new Map<string, RecipeIngredientRow[]>();
  for (const row of ingredientsRes.rows) {
    const list = byRecipe.get(row.recipe_id);
    if (list) list.push(row);
    else byRecipe.set(row.recipe_id, [row]);
  }

  return entriesRes.rows.map((entry) => {
    const ingredients = byRecipe.get(entry.recipe_id) ?? [];
    const missing = ingredients
      .map((ing) => ({
        ing,
        availability: computeAvailability(ing, stock, {
          scale: Number(entry.scale) || 1,
        }),
      }))
      .filter(({ availability }) =>
        availability.needed != null
          ? availability.needed > 0 && !availability.quantityUnknown
          : !availability.present
      )
      .map(({ ing, availability }) => ({
        name: ing.name,
        needed: availability.needed,
        unit: ing.unit,
      }));

    return {
      ...entry,
      scale: Number(entry.scale) || 1,
      missing,
      ingredientCount: ingredients.length,
      ready: missing.length === 0,
    };
  });
}

export interface AddPlanEntryInput {
  householdId: string;
  recipeId: string;
  scale?: number;
  plannedFor?: string | null;
  includeInList?: boolean;
  note?: string | null;
  userId?: string | null;
}

export async function addPlanEntry(
  db: { query: QueryFn },
  input: AddPlanEntryInput,
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO plan_entries (
       household_id, recipe_id, scale, planned_for, include_in_list, note, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.householdId,
      input.recipeId,
      input.scale ?? 1,
      input.plannedFor ?? null,
      input.includeInList ?? true,
      input.note ?? null,
      input.userId ?? null,
    ],
  );
  return res.rows[0].id;
}

export interface CookResult {
  ok: boolean;
  /** What the pantry could not cover — reported, never silently swallowed. */
  shortfalls: ConsumeShortfall[];
  /** Set when the recipe produces an ingredient that went into the pantry. */
  produced: { name: string; amount: number | null; unit: string | null } | null;
}

/**
 * Cook a planned entry: draw its ingredients out of the pantry, book whatever
 * the recipe produces back in, and close the entry.
 *
 * Everything is keyed to the entry, so cooking twice is a no-op and
 * {@link uncookPlanEntry} puts the stock back exactly as it was.
 */
export async function cookPlanEntry(
  db: { query: QueryFn },
  householdId: string,
  entryId: string,
  userId?: string | null,
): Promise<CookResult> {
  const entryRes = await db.query<{
    id: string;
    recipe_id: string;
    scale: number;
    status: PlanStatus;
    title: string;
    output_ingredient_id: string | null;
    output_amount: number | null;
    output_unit: string | null;
    output_expires_days: number | null;
    output_name: string | null;
  }>(
    `SELECT pe.id, pe.recipe_id, pe.scale, pe.status, r.title,
            r.output_ingredient_id, r.output_amount, r.output_unit,
            r.output_expires_days, g.name as output_name
     FROM plan_entries pe
     JOIN recipes r ON r.id = pe.recipe_id
     LEFT JOIN ingredients g ON g.id = r.output_ingredient_id
     WHERE pe.id = $1 AND pe.household_id = $2`,
    [entryId, householdId],
  );
  if (entryRes.rows.length === 0) {
    return { ok: false, shortfalls: [], produced: null };
  }
  const entry = entryRes.rows[0];
  const scale = Number(entry.scale) || 1;

  const ingredientsRes = await db.query<RecipeIngredientRow>(
    `SELECT ri.recipe_id, ri.ingredient_id, ri.name, ri.amount, ri.unit, g.density
     FROM recipe_ingredients ri
     LEFT JOIN ingredients g ON g.id = ri.ingredient_id
     WHERE ri.recipe_id = $1`,
    [entry.recipe_id],
  );

  const refs: IngredientRef[] = ingredientsRes.rows.map((row) => ({
    ingredient_id: row.ingredient_id,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    density: row.density,
  }));

  const consumed = await consumeStock(db, {
    householdId,
    refs,
    scale,
    kind: "cooked",
    source: { type: "plan_entry", id: entryId },
    note: `Cooked ${entry.title}`,
    userId,
  });
  if (!consumed.applied) {
    return { ok: false, shortfalls: [], produced: null };
  }

  let produced: CookResult["produced"] = null;
  if (entry.output_ingredient_id && entry.output_name) {
    const amount = entry.output_amount != null
      ? Number(entry.output_amount) * scale
      : null;
    const expiresAt = entry.output_expires_days != null
      ? isoDate(Date.now() + entry.output_expires_days * 86_400_000)
      : null;
    await addStock(db, {
      householdId,
      ingredientId: entry.output_ingredient_id,
      name: entry.output_name,
      amount,
      unit: entry.output_unit,
      kind: "produced",
      source: { type: "plan_entry", id: entryId },
      sourceSeq: -1,
      expiresAt,
      note: `Made by cooking ${entry.title}`,
      userId,
    });
    produced = { name: entry.output_name, amount, unit: entry.output_unit };
  }

  await db.query(
    `UPDATE plan_entries
     SET status = 'cooked', cooked_at = now(), updated_at = now()
     WHERE id = $1 AND household_id = $2`,
    [entryId, householdId],
  );

  return { ok: true, shortfalls: consumed.shortfalls, produced };
}

/** Undo a cook: stock goes back, the entry returns to the plan. */
export async function uncookPlanEntry(
  db: { query: QueryFn },
  householdId: string,
  entryId: string,
): Promise<boolean> {
  const reversed = await reverseSource(db, householdId, {
    type: "plan_entry",
    id: entryId,
  });
  await db.query(
    `UPDATE plan_entries
     SET status = 'planned', cooked_at = NULL, updated_at = now()
     WHERE id = $1 AND household_id = $2`,
    [entryId, householdId],
  );
  return reversed;
}

/** Cook a recipe that was never planned — records the entry, then cooks it. */
export async function cookNow(
  db: { query: QueryFn },
  input: AddPlanEntryInput,
): Promise<CookResult & { entryId: string }> {
  const entryId = await addPlanEntry(db, { ...input, includeInList: false });
  const result = await cookPlanEntry(
    db,
    input.householdId,
    entryId,
    input.userId,
  );
  return { ...result, entryId };
}

/** Recipes the household has cooked, most recent first. */
export async function loadCookHistory(
  db: { query: QueryFn },
  householdId: string,
  limit = 20,
): Promise<PlanEntry[]> {
  const res = await db.query<PlanEntry>(
    `SELECT pe.id, pe.recipe_id, pe.scale, pe.planned_for::text as planned_for,
            pe.status, pe.include_in_list, pe.note,
            pe.created_at::text as created_at, pe.cooked_at::text as cooked_at,
            r.title as recipe_title, r.slug as recipe_slug,
            m.url as cover_image_url
     FROM plan_entries pe
     JOIN recipes r ON r.id = pe.recipe_id
     LEFT JOIN media m ON m.id = r.cover_image_id
     WHERE pe.household_id = $1 AND pe.status = 'cooked'
     ORDER BY pe.cooked_at DESC
     LIMIT $2`,
    [householdId, limit],
  );
  return res.rows.map((r) => ({ ...r, scale: Number(r.scale) || 1 }));
}

/**
 * Recipes worth cooking next, ranked by what the pantry already covers and
 * what is about to go off. This is what turns an expiry warning into an answer.
 */
export interface Suggestion {
  recipe_id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  /** Expiring ingredients this recipe would use up. */
  uses: string[];
  missingCount: number;
  ingredientCount: number;
}

export async function suggestRecipes(
  db: { query: QueryFn },
  householdId: string,
  stock: StockItem[],
  expiring: StockItem[],
  limit = 6,
): Promise<Suggestion[]> {
  if (stock.length === 0) return [];

  const ingredientIds = stock
    .map((s) => s.ingredient_id)
    .filter((id): id is string => id != null);
  const names = stock.map((s) => s.name.toLowerCase());

  const res = await db.query<{
    recipe_id: string;
    title: string;
    slug: string;
    cover_image_url: string | null;
    ingredient_id: string | null;
    name: string;
    amount: number | null;
    unit: string | null;
    density: number | null;
  }>(
    `SELECT r.id as recipe_id, r.title, r.slug, m.url as cover_image_url,
            ri.ingredient_id, ri.name, ri.amount, ri.unit, g.density
     FROM recipes r
     LEFT JOIN media m ON m.id = r.cover_image_id
     JOIN recipe_ingredients ri ON ri.recipe_id = r.id
     LEFT JOIN ingredients g ON g.id = ri.ingredient_id
     WHERE (r.household_id = $1 OR r.private = false)
       AND EXISTS (
         SELECT 1 FROM recipe_ingredients hit
         WHERE hit.recipe_id = r.id
           AND (hit.ingredient_id = ANY($2) OR lower(hit.name) = ANY($3))
       )`,
    [householdId, ingredientIds, names],
  );

  const expiringKeys = new Set(
    expiring.map((e) => e.ingredient_id ?? e.name.toLowerCase()),
  );

  const byRecipe = new Map<string, Suggestion & { hasExpiring: boolean }>();
  for (const row of res.rows) {
    let entry = byRecipe.get(row.recipe_id);
    if (!entry) {
      entry = {
        recipe_id: row.recipe_id,
        title: row.title,
        slug: row.slug,
        cover_image_url: row.cover_image_url,
        uses: [],
        missingCount: 0,
        ingredientCount: 0,
        hasExpiring: false,
      };
      byRecipe.set(row.recipe_id, entry);
    }
    entry.ingredientCount++;

    const availability = computeAvailability(row, stock);
    const covered = availability.present &&
      (availability.needed === 0 || availability.quantityUnknown);
    if (!covered) entry.missingCount++;

    const key = row.ingredient_id ?? row.name.toLowerCase();
    if (covered && expiringKeys.has(key) && !entry.uses.includes(row.name)) {
      entry.uses.push(row.name);
      entry.hasExpiring = true;
    }
  }

  return [...byRecipe.values()]
    .sort((a, b) => {
      // Uses something about to go off first, then closest to cookable.
      if (a.uses.length !== b.uses.length) return b.uses.length - a.uses.length;
      return a.missingCount - b.missingCount;
    })
    .slice(0, limit)
    .map(({ hasExpiring: _hasExpiring, ...rest }) => rest);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
