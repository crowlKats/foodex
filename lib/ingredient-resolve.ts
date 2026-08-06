// Every recipe line must reference a real ingredient entity (migration 067
// made the column NOT NULL). This helper upholds that at write time: rows that
// arrive without a link — free text on the recipe form, imports the agent
// didn't link — get matched to an existing ingredient by normalized name, or a
// new entity is created from the line's name and unit.

import type { QueryFn } from "../db/mod.ts";
import { normalizeName } from "./inventory.ts";

export interface IngredientLinkRow {
  /** Optional so form-parsed records fit; blank/missing names are skipped. */
  name?: string;
  ingredient_id?: string | null;
  unit?: string | null;
}

/**
 * Fill in `ingredient_id` on every row with a non-blank name, creating missing
 * ingredients as needed. Mutates the rows in place. Run inside the caller's
 * transaction so a failed save doesn't leave stray ingredient entities behind.
 */
export async function ensureIngredientIds(
  q: QueryFn,
  rows: IngredientLinkRow[],
): Promise<void> {
  const unresolved = rows.filter(
    (r): r is IngredientLinkRow & { name: string } =>
      !r.ingredient_id?.trim() && !!r.name?.trim(),
  );
  if (unresolved.length === 0) return;

  // One lookup for all names; when several entities share a normalized name,
  // prefer the oldest — the same pick migration 067 made when backfilling.
  const norms = [...new Set(unresolved.map((r) => normalizeName(r.name)))];
  const existing = await q<{ id: string; norm: string }>(
    `SELECT DISTINCT ON (fx_norm_name(name)) fx_norm_name(name) AS norm, id
     FROM ingredients
     WHERE fx_norm_name(name) = ANY($1)
     ORDER BY fx_norm_name(name), created_at, id`,
    [norms],
  );
  const byNorm = new Map(existing.rows.map((r) => [r.norm, r.id]));

  for (const row of unresolved) {
    const norm = normalizeName(row.name);
    let id = byNorm.get(norm);
    if (!id) {
      const created = await q<{ id: string }>(
        "INSERT INTO ingredients (name, unit) VALUES ($1, $2) RETURNING id",
        [row.name.trim(), row.unit?.trim() || ""],
      );
      id = created.rows[0].id;
      byNorm.set(norm, id);
    }
    row.ingredient_id = id;
  }
}
