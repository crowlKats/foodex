/**
 * Planned meals: the layer both the pantry and the shopping list hang off.
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
  /** Null while the entry is planned by dish and no recipe is pinned yet. */
  recipe_id: string | null;
  recipe_title: string | null;
  recipe_slug: string | null;
  dish_id: string | null;
  dish_name: string | null;
  dish_slug: string | null;
  target_servings: number | null;
  cover_image_url: string | null;
  scale: number;
  planned_for: string | null;
  status: PlanStatus;
  include_in_list: boolean;
  note: string | null;
  created_at: string;
  cooked_at: string | null;
}

/** A recipe that could satisfy a dish-planned entry. */
export interface PlanCandidate {
  recipe_id: string;
  title: string;
  slug: string;
  /** Belongs to the planning household. */
  own: boolean;
  missingCount: number;
  ingredientCount: number;
}

export interface PlanEntryWithReadiness extends PlanEntry {
  /** Ingredients the pantry can't cover at this scale. */
  missing: { name: string; needed: number | null; unit: string | null }[];
  ingredientCount: number;
  ready: boolean;
  /** For unpinned dish entries: the recipes to choose from, best first. */
  candidates: PlanCandidate[];
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
            pe.dish_id, pe.target_servings,
            r.title as recipe_title, r.slug as recipe_slug,
            d.name as dish_name, d.slug as dish_slug,
            m.url as cover_image_url
     FROM plan_entries pe
     LEFT JOIN recipes r ON r.id = pe.recipe_id
       AND (r.private = false OR r.household_id = pe.household_id)
     LEFT JOIN dishes d ON d.id = pe.dish_id
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

  // Candidate recipes for unpinned dish entries, before the ingredient fetch
  // so their readiness can be computed in the same pass.
  const unpinnedDishIds = [
    ...new Set(
      entriesRes.rows
        .filter((e) => e.recipe_id == null && e.dish_id != null)
        .map((e) => e.dish_id!),
    ),
  ];
  const candidateRows = unpinnedDishIds.length > 0
    ? (await db.query<{
      id: string;
      title: string;
      slug: string;
      dish_id: string;
      household_id: string;
    }>(
      `SELECT id, title, slug, dish_id, household_id FROM recipes
       WHERE dish_id = ANY($1) AND (private = false OR household_id = $2)
       ORDER BY created_at`,
      [unpinnedDishIds, householdId],
    )).rows
    : [];

  const pinnedIds = entriesRes.rows
    .map((e) => e.recipe_id)
    .filter((id): id is string => id != null);
  const recipeIds = [
    ...new Set([...pinnedIds, ...candidateRows.map((c) => c.id)]),
  ];
  const [ingredientsRes, stock] = await Promise.all([
    recipeIds.length > 0
      ? db.query<RecipeIngredientRow>(
        `SELECT ri.recipe_id, ri.ingredient_id,
              COALESCE(g.name, ri.name) AS name, ri.amount, ri.unit,
              g.density
       FROM recipe_ingredients ri
       LEFT JOIN ingredients g ON g.id = ri.ingredient_id
       WHERE ri.recipe_id = ANY($1)
         AND NOT ri.intermediate
         AND NOT COALESCE(g.always_on_hand, false)
       ORDER BY ri.sort_order`,
        [recipeIds],
      )
      : Promise.resolve({ rows: [] as RecipeIngredientRow[] }),
    loadStock(db, householdId),
  ]);

  const byRecipe = new Map<string, RecipeIngredientRow[]>();
  for (const row of ingredientsRes.rows) {
    const list = byRecipe.get(row.recipe_id);
    if (list) list.push(row);
    else byRecipe.set(row.recipe_id, [row]);
  }

  const missingCount = (recipeId: string, scale: number): number => {
    const ingredients = byRecipe.get(recipeId) ?? [];
    return ingredients.filter((ing) => {
      const availability = computeAvailability(ing, stock, { scale });
      return availability.needed != null
        ? availability.needed > 0 && !availability.quantityUnknown
        : !availability.present;
    }).length;
  };

  // Own recipes first, then whatever the pantry covers best.
  const candidatesByDish = new Map<string, PlanCandidate[]>();
  for (const c of candidateRows) {
    const list = candidatesByDish.get(c.dish_id) ?? [];
    list.push({
      recipe_id: c.id,
      title: c.title,
      slug: c.slug,
      own: c.household_id === householdId,
      missingCount: missingCount(c.id, 1),
      ingredientCount: (byRecipe.get(c.id) ?? []).length,
    });
    candidatesByDish.set(c.dish_id, list);
  }
  for (const list of candidatesByDish.values()) {
    list.sort((a, b) =>
      Number(b.own) - Number(a.own) || a.missingCount - b.missingCount
    );
  }

  return entriesRes.rows.map((entry) => {
    const ingredients = entry.recipe_id
      ? byRecipe.get(entry.recipe_id) ?? []
      : [];
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
      target_servings: entry.target_servings != null
        ? Number(entry.target_servings)
        : null,
      missing,
      ingredientCount: ingredients.length,
      ready: entry.recipe_id != null && missing.length === 0,
      candidates: entry.recipe_id == null && entry.dish_id != null
        ? candidatesByDish.get(entry.dish_id) ?? []
        : [],
    };
  });
}

export interface AddPlanEntryInput {
  householdId: string;
  /** Either a specific recipe or a dish whose recipe is chosen later. */
  recipeId?: string | null;
  dishId?: string | null;
  targetServings?: number | null;
  scale?: number;
  plannedFor?: string | null;
  includeInList?: boolean;
  note?: string | null;
  userId?: string | null;
}

/**
 * Whether this household may see the recipe: public, or private to them.
 * Same predicate pinPlanEntry already uses.
 */
export async function recipeIsVisible(
  db: { query: QueryFn },
  recipeId: string,
  householdId: string,
): Promise<boolean> {
  const res = await db.query(
    `SELECT 1 FROM recipes
     WHERE id = $1 AND (private = false OR household_id = $2)`,
    [recipeId, householdId],
  );
  return res.rows.length > 0;
}

export async function addPlanEntry(
  db: { query: QueryFn },
  input: AddPlanEntryInput,
): Promise<string | null> {
  if (!input.recipeId && !input.dishId) {
    throw new Error("plan entry needs a recipe or a dish");
  }
  if (
    input.recipeId &&
    !(await recipeIsVisible(db, input.recipeId, input.householdId))
  ) {
    return null;
  }
  const res = await db.query<{ id: string }>(
    `INSERT INTO plan_entries (
       household_id, recipe_id, dish_id, target_servings, scale, planned_for,
       include_in_list, note, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.householdId,
      input.recipeId ?? null,
      input.dishId ?? null,
      input.targetServings ?? null,
      input.scale ?? 1,
      input.plannedFor ?? null,
      input.includeInList ?? true,
      input.note ?? null,
      input.userId ?? null,
    ],
  );
  return res.rows[0].id;
}

/**
 * Pin a recipe onto a dish-planned entry (or switch an uncooked one). The
 * batch scale is derived from the entry's target servings against the
 * recipe's own base quantity, so "Carbonara for 6" picks the right multiple
 * of whichever recipe was chosen.
 */
export async function pinPlanEntry(
  db: { query: QueryFn },
  householdId: string,
  entryId: string,
  recipeId: string,
): Promise<boolean> {
  const entryRes = await db.query<{
    dish_id: string | null;
    target_servings: number | null;
  }>(
    `SELECT dish_id, target_servings FROM plan_entries
     WHERE id = $1 AND household_id = $2 AND status <> 'cooked'`,
    [entryId, householdId],
  );
  if (entryRes.rows.length === 0 || entryRes.rows[0].dish_id == null) {
    return false;
  }
  const entry = entryRes.rows[0];

  const recipeRes = await db.query<{
    quantity_type: string;
    quantity_value: number;
  }>(
    `SELECT quantity_type, quantity_value FROM recipes
     WHERE id = $1 AND dish_id = $2 AND (private = false OR household_id = $3)`,
    [recipeId, entry.dish_id, householdId],
  );
  if (recipeRes.rows.length === 0) return false;
  const recipe = recipeRes.rows[0];

  const target = entry.target_servings != null
    ? Number(entry.target_servings)
    : null;
  const base = Number(recipe.quantity_value);
  const scale = target != null && recipe.quantity_type === "servings" &&
      base > 0
    ? target / base
    : 1;

  await db.query(
    `UPDATE plan_entries SET recipe_id = $1, scale = $2, updated_at = now()
     WHERE id = $3 AND household_id = $4`,
    [recipeId, scale, entryId, householdId],
  );
  return true;
}

export interface CookResult {
  ok: boolean;
  /** What the pantry could not cover; reported, never silently swallowed. */
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
       AND (r.private = false OR r.household_id = pe.household_id)
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
    `SELECT ri.recipe_id, ri.ingredient_id,
            COALESCE(g.name, ri.name) AS name, ri.amount, ri.unit, g.density
     FROM recipe_ingredients ri
     LEFT JOIN ingredients g ON g.id = ri.ingredient_id
     WHERE ri.recipe_id = $1
       AND NOT ri.intermediate
         AND NOT COALESCE(g.always_on_hand, false)`,
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

/** Cook a recipe that was never planned: records the entry, then cooks it. */
export async function cookNow(
  db: { query: QueryFn },
  input: AddPlanEntryInput,
): Promise<CookResult & { entryId: string }> {
  const entryId = await addPlanEntry(db, { ...input, includeInList: false });
  if (entryId == null) {
    return { ok: false, shortfalls: [], produced: null, entryId: "" };
  }
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
       AND (r.private = false OR r.household_id = pe.household_id)
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
     WHERE NOT ri.intermediate
       AND NOT COALESCE(g.always_on_hand, false)
       AND (r.household_id = $1 OR r.private = false)
       AND EXISTS (
         SELECT 1 FROM recipe_ingredients hit
         WHERE hit.recipe_id = r.id
           AND NOT hit.intermediate
           AND (hit.ingredient_id = ANY($2) OR lower(hit.name) = ANY($3))
       )
       -- Already on the plan is not a suggestion. Beyond offering a second
       -- entry for a meal you've planned, suggestions are evaluated at scale
       -- 1 while the plan entry uses the batch you actually set, so the two
       -- sat side by side on /plan disagreeing about the same recipe.
       AND NOT EXISTS (
         SELECT 1 FROM plan_entries pe
         WHERE pe.household_id = $1
           AND pe.recipe_id = r.id
           AND pe.status = 'planned'
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
