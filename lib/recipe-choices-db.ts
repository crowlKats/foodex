// DB side of recipe choices; the pure selection/projection half lives in
// recipe-choices.ts so islands can import it without pulling in the driver.

import type { QueryFn } from "../db/mod.ts";
import type { RecipeChoice, RecipeChoiceOption } from "../db/types.ts";
import type { ChoiceInfo } from "./recipe-choices.ts";

/** A recipe's choices with their options, in display order. */
export async function loadRecipeChoices(
  q: QueryFn,
  recipeId: string,
): Promise<ChoiceInfo[]> {
  const [choices, options] = await Promise.all([
    q<RecipeChoice>(
      `SELECT * FROM recipe_choices WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipeId],
    ),
    q<RecipeChoiceOption>(
      `SELECT o.* FROM recipe_choice_options o
       JOIN recipe_choices c ON c.id = o.choice_id
       WHERE c.recipe_id = $1 ORDER BY o.sort_order, o.id`,
      [recipeId],
    ),
  ]);
  return choices.rows.map((c) => ({
    id: c.id,
    key: c.key,
    title: c.title,
    description: c.description,
    options: options.rows
      .filter((o) => o.choice_id === c.id)
      .map((o) => ({ id: o.id, key: o.key, title: o.title })),
  }));
}

/**
 * Option id → its choice key, the `alt` group a step or section carries in
 * the agent/export shapes.
 */
export function altGroupById(choices: ChoiceInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of choices) for (const o of c.options) map.set(o.id, c.key);
  return map;
}

/**
 * Resolve an ingredient row's option to the alternative it is for: the step
 * or section carrying the same option id. Returns positions into the given
 * lists; callers turn those into ids, keys or indices as their shape needs.
 */
export function ingredientTarget(
  optionId: string | null,
  steps: { option_id: string | null }[],
  sections: { option_id: string | null }[],
): { step: number | null; section: number | null } {
  if (!optionId) return { step: null, section: null };
  const step = steps.findIndex((s) => s.option_id === optionId);
  if (step >= 0) return { step, section: null };
  const section = sections.findIndex((s) => s.option_id === optionId);
  return { step: null, section: section >= 0 ? section : null };
}

/**
 * The member of each option: the first row (in sort order) carrying the
 * option id. Branch rows that follow a member share its option but are
 * not members themselves; only members carry `alt` in the agent/export
 * shapes, and branch membership is re-derived from the graph on save.
 */
export function memberRowIds(
  rows: { id: string; option_id: string | null }[],
): Set<string> {
  const seen = new Set<string>();
  const members = new Set<string>();
  for (const r of rows) {
    if (!r.option_id || seen.has(r.option_id)) continue;
    seen.add(r.option_id);
    members.add(r.id);
  }
  return members;
}

/** The `alternatives` array of the agent/export shapes: one per fork. */
export function alternativesOf(
  choices: ChoiceInfo[],
): { key: string; description: string }[] {
  return choices.map((c) => ({ key: c.key, description: c.description ?? "" }));
}
