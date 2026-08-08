// The agent-facing recipe representation and its DB read/write adapters.
//
// This shape is what `get_recipe` returns, what the agent patches, and what a
// staged recipe applies from. It mirrors the recipe form fields but keys every
// child collection by a stable identifier (ingredient key, step id, section key,
// tool id, referenced recipe id) so patch ops survive reordering. Applying
// serializes back to the exact FormData field names `saveRecipeChildren` expects,
// so the whole child-save path (deps, sections, media, tags) is reused verbatim.

import { saveRecipeChildren } from "../recipe-save.ts";
import { uniqueSlug } from "../slug.ts";
import { isoVersion } from "./version.ts";
import type { QueryFn } from "../../db/mod.ts";
import type {
  Recipe,
  RecipeIngredient,
  RecipeReference,
  RecipeStep,
  RecipeStepDep,
  RecipeStepSection,
  RecipeTag,
  RecipeTool,
} from "../../db/types.ts";

export interface AgentIngredientRow {
  key: string;
  name: string;
  amount?: string;
  unit?: string;
  /** Prep/usage note for this line (e.g. finely chopped, room temperature). */
  note?: string | null;
  ingredient_id?: string | null;
  /** Made during this recipe: no library link, never shopped. */
  intermediate?: boolean;
}
export interface AgentSection {
  key: string;
  title: string;
  /** keys of sections that must finish first */
  after?: string[];
}
export interface AgentStep {
  id: string;
  title?: string;
  body?: string;
  section?: string | null;
  /** ids of steps that must finish first (same section only) */
  after?: string[];
  media?: string[];
}
export interface AgentTool {
  tool_id: string;
  /** The tool entity's name; lets `@tool(name)` refs in step bodies be
   *  validated without a DB round-trip. */
  tool_name?: string | null;
  settings?: string | null;
}

export interface AgentRecipe {
  title: string;
  description?: string | null;
  quantity_type?: string;
  quantity_value?: number;
  quantity_unit?: string;
  quantity_value2?: number | null;
  quantity_value3?: number | null;
  quantity_unit2?: string | null;
  /** For dimensions (tray) recipes: the yield in servings/pieces, if stated. */
  quantity_servings?: number | null;
  prep_time?: number | null;
  cook_time?: number | null;
  rest_time?: number | null;
  difficulty?: string | null;
  private?: boolean;
  cover_image_id?: string | null;
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  output_ingredient_id?: string | null;
  output_amount?: number | null;
  output_unit?: string | null;
  output_expires_days?: number | null;
  meal_types?: string[];
  dietary_tags?: string[];
  ingredients: AgentIngredientRow[];
  sections?: AgentSection[];
  steps: AgentStep[];
  tools?: AgentTool[];
  refs?: { referenced_recipe_id: string }[];
}

// ── DB → agent representation ───────────────────────────────────────

/** Load a recipe and all children, keyed for the agent. `updated_at` is the version. */
export async function loadAgentRecipe(
  q: QueryFn,
  recipeId: string,
): Promise<{ recipe: AgentRecipe; version: string } | null> {
  const recipeRes = await q<Recipe>("SELECT * FROM recipes WHERE id = $1", [
    recipeId,
  ]);
  if (recipeRes.rows.length === 0) return null;
  const recipe = recipeRes.rows[0];

  const [ing, secs, secDeps, steps, stepDeps, media, tools, refs, tags] =
    await Promise.all([
      q<RecipeIngredient>(
        `SELECT ri.*, g.name as ingredient_name FROM recipe_ingredients ri
         LEFT JOIN ingredients g ON g.id = ri.ingredient_id
         WHERE ri.recipe_id = $1 ORDER BY ri.sort_order, ri.id`,
        [recipeId],
      ),
      q<RecipeStepSection>(
        `SELECT * FROM recipe_step_sections WHERE recipe_id = $1 ORDER BY sort_order, id`,
        [recipeId],
      ),
      q<{ section_id: string; depends_on: string }>(
        `SELECT sd.section_id, sd.depends_on FROM recipe_section_deps sd
         JOIN recipe_step_sections s ON s.id = sd.section_id WHERE s.recipe_id = $1`,
        [recipeId],
      ),
      q<RecipeStep>(
        `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
        [recipeId],
      ),
      q<RecipeStepDep>(
        `SELECT sd.step_id, sd.depends_on FROM recipe_step_deps sd
         JOIN recipe_steps rs ON rs.id = sd.step_id WHERE rs.recipe_id = $1`,
        [recipeId],
      ),
      q<{ step_id: string; media_id: string; sort_order: number }>(
        `SELECT rsm.step_id, rsm.media_id, rsm.sort_order FROM recipe_step_media rsm
         JOIN recipe_steps rs ON rs.id = rsm.step_id WHERE rs.recipe_id = $1
         ORDER BY rsm.step_id, rsm.sort_order`,
        [recipeId],
      ),
      q<RecipeTool>(
        `SELECT rt.*, t.name as tool_name FROM recipe_tools rt
         JOIN tools t ON t.id = rt.tool_id WHERE rt.recipe_id = $1
         ORDER BY rt.sort_order, rt.id`,
        [recipeId],
      ),
      q<RecipeReference>(
        `SELECT * FROM recipe_references WHERE recipe_id = $1 ORDER BY sort_order, id`,
        [recipeId],
      ),
      q<RecipeTag>(`SELECT * FROM recipe_tags WHERE recipe_id = $1`, [
        recipeId,
      ]),
    ]);

  const sectionKeyById = new Map(secs.rows.map((s) => [s.id, s.key]));
  const sectionDepsBySection = new Map<string, string[]>();
  for (const d of secDeps.rows) {
    const arr = sectionDepsBySection.get(d.section_id) ?? [];
    const depKey = sectionKeyById.get(d.depends_on);
    if (depKey) arr.push(depKey);
    sectionDepsBySection.set(d.section_id, arr);
  }

  const stepDepsByStep = new Map<string, string[]>();
  for (const d of stepDeps.rows) {
    const arr = stepDepsByStep.get(d.step_id) ?? [];
    arr.push(d.depends_on);
    stepDepsByStep.set(d.step_id, arr);
  }
  const mediaByStep = new Map<string, string[]>();
  for (const m of media.rows) {
    const arr = mediaByStep.get(m.step_id) ?? [];
    arr.push(m.media_id);
    mediaByStep.set(m.step_id, arr);
  }

  const agent: AgentRecipe = {
    title: recipe.title,
    description: recipe.description,
    quantity_type: recipe.quantity_type,
    quantity_value: recipe.quantity_value,
    quantity_unit: recipe.quantity_unit,
    quantity_value2: recipe.quantity_value2,
    quantity_value3: recipe.quantity_value3,
    quantity_unit2: recipe.quantity_unit2,
    quantity_servings: recipe.quantity_servings,
    prep_time: recipe.prep_time,
    cook_time: recipe.cook_time,
    rest_time: recipe.rest_time,
    difficulty: recipe.difficulty,
    private: recipe.private,
    cover_image_id: recipe.cover_image_id,
    source_type: recipe.source_type,
    source_name: recipe.source_name,
    source_url: recipe.source_url,
    output_ingredient_id: recipe.output_ingredient_id,
    output_amount: recipe.output_amount,
    output_unit: recipe.output_unit,
    output_expires_days: recipe.output_expires_days,
    meal_types: tags.rows.filter((t) => t.tag_type === "meal_type").map((t) =>
      t.tag_value
    ),
    dietary_tags: tags.rows.filter((t) => t.tag_type === "dietary").map((t) =>
      t.tag_value
    ),
    ingredients: ing.rows.map((r) => ({
      key: r.key ?? "",
      // Prefer the live ingredient name: the line's snapshot goes stale when
      // the ingredient is renamed or merged away.
      name: r.ingredient_name ?? r.name,
      amount: r.amount != null ? String(r.amount) : "",
      unit: r.unit ?? "",
      note: r.note ?? "",
      ingredient_id: r.ingredient_id,
      intermediate: r.intermediate ?? false,
    })),
    sections: secs.rows.map((s) => ({
      key: s.key,
      title: s.title,
      after: sectionDepsBySection.get(s.id) ?? [],
    })),
    steps: steps.rows.map((s) => ({
      id: s.id,
      title: s.title,
      body: s.body,
      section: s.section_id ? sectionKeyById.get(s.section_id) ?? null : null,
      after: stepDepsByStep.get(s.id) ?? [],
      media: mediaByStep.get(s.id) ?? [],
    })),
    tools: tools.rows.map((t) => ({
      tool_id: t.tool_id,
      tool_name: t.tool_name,
      settings: t.settings,
    })),
    refs: refs.rows.map((r) => ({
      referenced_recipe_id: r.referenced_recipe_id,
    })),
  };

  return { recipe: agent, version: isoVersion(recipe.updated_at) };
}

// ── Agent representation → FormData (for saveRecipeChildren) ─────────

/** Serialize child collections to the exact field names saveRecipeChildren reads. */
export function agentRecipeToFormData(r: AgentRecipe): FormData {
  const fd = new FormData();

  const ingredients = r.ingredients ?? [];
  ingredients.forEach((ing, i) => {
    fd.set(`ingredients[${i}][name]`, ing.name ?? "");
    fd.set(`ingredients[${i}][key]`, ing.key ?? "");
    fd.set(`ingredients[${i}][amount]`, ing.amount ?? "");
    fd.set(`ingredients[${i}][unit]`, ing.unit ?? "");
    fd.set(`ingredients[${i}][note]`, ing.note ?? "");
    fd.set(
      `ingredients[${i}][intermediate]`,
      ing.intermediate === true ? "true" : "false",
    );
    if (ing.ingredient_id && ing.intermediate !== true) {
      fd.set(`ingredients[${i}][ingredient_id]`, ing.ingredient_id);
    }
  });

  const sections = r.sections ?? [];
  const sectionKeyToIdx = new Map(sections.map((s, i) => [s.key, i]));
  sections.forEach((sec, i) => {
    fd.set(`sections[${i}][title]`, sec.title ?? "");
    fd.set(`sections[${i}][key]`, sec.key ?? "");
    const after = (sec.after ?? [])
      .map((k) => sectionKeyToIdx.get(k))
      .filter((n): n is number => n != null);
    fd.set(`sections[${i}][after]`, after.join(","));
  });

  const steps = r.steps ?? [];
  const stepIdToIdx = new Map(steps.map((s, i) => [s.id, i]));
  steps.forEach((step, i) => {
    fd.set(`steps[${i}][title]`, step.title ?? "");
    fd.set(`steps[${i}][body]`, step.body ?? "");
    const secIdx = step.section != null
      ? sectionKeyToIdx.get(step.section)
      : undefined;
    fd.set(`steps[${i}][section]`, secIdx != null ? String(secIdx) : "");
    const after = (step.after ?? [])
      .map((id) => stepIdToIdx.get(id))
      .filter((n): n is number => n != null);
    fd.set(`steps[${i}][after]`, after.join(","));
    (step.media ?? []).forEach((mediaId, mi) => {
      fd.set(`steps[${i}][media][${mi}]`, mediaId);
    });
  });

  const tools = r.tools ?? [];
  tools.forEach((t, i) => {
    fd.set(`tools[${i}][tool_id]`, t.tool_id);
    if (t.settings) fd.set(`tools[${i}][settings]`, t.settings);
  });

  (r.refs ?? []).forEach((ref, i) => {
    fd.set(`refs[${i}][referenced_recipe_id]`, ref.referenced_recipe_id);
  });

  for (const v of r.meal_types ?? []) fd.append("meal_type", v);
  for (const v of r.dietary_tags ?? []) fd.append("dietary", v);

  return fd;
}

// ── Insert / update ─────────────────────────────────────────────────

const SCALAR_COLS = [
  "description",
  "quantity_type",
  "quantity_value",
  "quantity_unit",
  "quantity_value2",
  "quantity_value3",
  "quantity_unit2",
  "quantity_servings",
  "prep_time",
  "cook_time",
  "rest_time",
  "cover_image_id",
  "difficulty",
  "private",
  "source_type",
  "source_name",
  "source_url",
  "output_ingredient_id",
  "output_amount",
  "output_unit",
  "output_expires_days",
] as const;

function scalarValues(r: AgentRecipe): unknown[] {
  return [
    r.description?.trim() || null,
    r.quantity_type || "servings",
    r.quantity_value ?? 4,
    r.quantity_unit || "servings",
    r.quantity_value2 ?? null,
    r.quantity_value3 ?? null,
    r.quantity_unit2 ?? null,
    r.quantity_servings ?? null,
    r.prep_time ?? null,
    r.cook_time ?? null,
    r.rest_time ?? null,
    r.cover_image_id || null,
    r.difficulty || null,
    r.private ?? false,
    r.source_type || null,
    r.source_name?.trim() || null,
    r.source_url?.trim() || null,
    r.output_ingredient_id || null,
    r.output_amount ?? null,
    r.output_unit || null,
    r.output_expires_days ?? null,
  ];
}

/** Insert a new recipe (+children) from the agent representation. */
export async function createRecipeFromData(
  q: QueryFn,
  householdId: string,
  r: AgentRecipe,
): Promise<{ recipe_id: string; slug: string }> {
  const slug = await uniqueSlug(q, r.title);
  const cols = ["title", "slug", "household_id", ...SCALAR_COLS];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const res = await q<{ id: string }>(
    `INSERT INTO recipes (${
      cols.join(", ")
    }) VALUES (${placeholders}) RETURNING id`,
    [r.title.trim(), slug, householdId, ...scalarValues(r)],
  );
  const recipeId = res.rows[0].id;
  await saveRecipeChildren(q, recipeId, agentRecipeToFormData(r));
  return { recipe_id: recipeId, slug };
}

/** Replace a recipe (+children) from the agent representation. */
export async function updateRecipeFromData(
  q: QueryFn,
  recipeId: string,
  r: AgentRecipe,
): Promise<{ slug: string }> {
  const slug = await uniqueSlug(q, r.title, recipeId);
  const setCols = ["title", "slug", ...SCALAR_COLS];
  const assignments = setCols
    .map((c, i) => `${c} = $${i + 1}`)
    .join(", ");
  await q(
    `UPDATE recipes SET ${assignments}, updated_at = now() WHERE id = $${
      setCols.length + 1
    }`,
    [r.title.trim(), slug, ...scalarValues(r), recipeId],
  );
  await Promise.all([
    q("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipeId]),
    q("DELETE FROM recipe_tools WHERE recipe_id = $1", [recipeId]),
    q("DELETE FROM recipe_steps WHERE recipe_id = $1", [recipeId]),
    q("DELETE FROM recipe_step_sections WHERE recipe_id = $1", [recipeId]),
    q("DELETE FROM recipe_references WHERE recipe_id = $1", [recipeId]),
    q("DELETE FROM recipe_tags WHERE recipe_id = $1", [recipeId]),
  ]);
  await saveRecipeChildren(q, recipeId, agentRecipeToFormData(r));
  return { slug };
}
