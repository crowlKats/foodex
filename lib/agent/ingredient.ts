// Agent-facing ingredient entity (flat: name / unit / density) + DB adapters.

import type { QueryFn } from "../../db/mod.ts";
import type { Ingredient } from "../../db/types.ts";
import { isoVersion } from "./version.ts";

export interface AgentIngredient {
  name: string;
  unit?: string | null;
  density?: number | null;
}

export async function loadAgentIngredient(
  q: QueryFn,
  id: string,
): Promise<{ ingredient: AgentIngredient; version: string } | null> {
  const res = await q<Ingredient>(
    "SELECT id, name, unit, density, updated_at FROM ingredients WHERE id = $1",
    [id],
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0] as Ingredient & { updated_at: string };
  return {
    ingredient: { name: r.name, unit: r.unit, density: r.density },
    version: isoVersion(r.updated_at),
  };
}

export async function createIngredientFromData(
  q: QueryFn,
  r: AgentIngredient,
): Promise<{ ingredient_id: string }> {
  const res = await q<{ id: string }>(
    "INSERT INTO ingredients (name, unit, density) VALUES ($1, $2, $3) RETURNING id",
    [r.name.trim(), r.unit?.trim() || null, r.density ?? null],
  );
  return { ingredient_id: res.rows[0].id };
}

export async function updateIngredientFromData(
  q: QueryFn,
  id: string,
  r: AgentIngredient,
): Promise<void> {
  await q(
    "UPDATE ingredients SET name = $1, unit = $2, density = $3, updated_at = now() WHERE id = $4",
    [r.name.trim(), r.unit?.trim() || null, r.density ?? null, id],
  );
}
