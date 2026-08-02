import type { QueryFn } from "../db/mod.ts";
import type {
  Ingredient,
  Recipe,
  RecipeIngredient,
  RecipeReference,
  RecipeStep,
  RecipeStepDep,
  RecipeStepSection,
  RecipeTag,
  RecipeTool,
  RecipeWithCoverMedia,
  Tool,
} from "../db/types.ts";

/**
 * Everything the recipe edit form needs to render. Shared by the real edit
 * route and the layout-comparison previews under `edit-preview/`, so the
 * variants differ only in arrangement, never in the data behind them.
 */
export type RecipeEditData = Awaited<
  ReturnType<typeof loadRecipeEditData>
> extends infer T ? T extends null ? never : T : never;

export async function loadRecipeEditData(query: QueryFn, slug: string) {
  const recipeRes = await query<RecipeWithCoverMedia>(
    `SELECT r.*, m.id as cover_media_id, m.url as cover_media_url, m.filename as cover_media_filename, m.content_type as cover_media_content_type
     FROM recipes r
     LEFT JOIN media m ON m.id = r.cover_image_id
     WHERE r.slug = $1`,
    [slug],
  );
  if (recipeRes.rows.length === 0) return null;
  const recipe = recipeRes.rows[0];

  const ingredientsRes = await query<RecipeIngredient>(
    `SELECT ri.*, g.name as ingredient_name
     FROM recipe_ingredients ri
     LEFT JOIN ingredients g ON g.id = ri.ingredient_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.sort_order, ri.id`,
    [recipe.id],
  );

  const toolsRes = await query<RecipeTool>(
    `SELECT rt.*, t.name as tool_name
     FROM recipe_tools rt
     JOIN tools t ON t.id = rt.tool_id
     WHERE rt.recipe_id = $1
     ORDER BY rt.sort_order, rt.id`,
    [recipe.id],
  );

  const stepsRes = await query<RecipeStep>(
    `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
    [recipe.id],
  );

  const sectionsRes = await query<RecipeStepSection>(
    `SELECT * FROM recipe_step_sections WHERE recipe_id = $1 ORDER BY sort_order, id`,
    [recipe.id],
  );

  const sectionDepsRes = await query<
    { section_id: string; depends_on: string }
  >(
    `SELECT sd.section_id, sd.depends_on
     FROM recipe_section_deps sd
     JOIN recipe_step_sections s ON s.id = sd.section_id
     WHERE s.recipe_id = $1`,
    [recipe.id],
  );

  const [stepMediaRes, stepDepsRes] = await Promise.all([
    query<
      { step_id: string; sort_order: number; media_id: string; url: string }
    >(
      `SELECT rsm.step_id, rsm.sort_order, m.id as media_id, m.url
       FROM recipe_step_media rsm
       JOIN media m ON m.id = rsm.media_id
       JOIN recipe_steps rs ON rs.id = rsm.step_id
       WHERE rs.recipe_id = $1
       ORDER BY rsm.step_id, rsm.sort_order`,
      [recipe.id],
    ),
    query<RecipeStepDep>(
      `SELECT sd.step_id, sd.depends_on
       FROM recipe_step_deps sd
       JOIN recipe_steps rs ON rs.id = sd.step_id
       WHERE rs.recipe_id = $1`,
      [recipe.id],
    ),
  ]);

  const stepMediaMap = new Map<string, { id: string; url: string }[]>();
  for (const row of stepMediaRes.rows) {
    const stepId = String(row.step_id);
    if (!stepMediaMap.has(stepId)) stepMediaMap.set(stepId, []);
    stepMediaMap.get(stepId)!.push({
      id: String(row.media_id),
      url: String(row.url),
    });
  }

  // Build a map from step ID → indices of steps it depends on
  const stepIdToIndex = new Map<string, number>();
  stepsRes.rows.forEach((s, i) => stepIdToIndex.set(s.id, i));
  const stepAfterMap = new Map<string, number[]>();
  for (const dep of stepDepsRes.rows) {
    const idx = stepIdToIndex.get(dep.depends_on);
    if (idx == null) continue;
    if (!stepAfterMap.has(dep.step_id)) stepAfterMap.set(dep.step_id, []);
    stepAfterMap.get(dep.step_id)!.push(idx);
  }

  const refsRes = await query<RecipeReference>(
    `SELECT rr.*, r.title as ref_title, r.slug as ref_slug
     FROM recipe_references rr
     JOIN recipes r ON r.id = rr.referenced_recipe_id
     WHERE rr.recipe_id = $1
     ORDER BY rr.sort_order`,
    [recipe.id],
  );

  const tagsRes = await query<RecipeTag>(
    "SELECT tag_type, tag_value FROM recipe_tags WHERE recipe_id = $1",
    [recipe.id],
  );
  const mealTypes = tagsRes.rows
    .filter((t) => t.tag_type === "meal_type")
    .map((t) => t.tag_value);
  const dietaryTags = tagsRes.rows
    .filter((t) => t.tag_type === "dietary")
    .map((t) => t.tag_value);

  const ingredientsListRes = await query<Ingredient>(
    "SELECT id, name, unit FROM ingredients ORDER BY name",
  );
  const allToolsRes = await query<Tool>(
    "SELECT id, name FROM tools ORDER BY name",
  );
  const allRecipesRes = await query<Recipe>(
    "SELECT id, title, slug FROM recipes WHERE id != $1 ORDER BY title",
    [recipe.id],
  );

  // Map section UUID → index in the sections array (form expects index)
  const sectionIdToIndex = new Map<string, number>();
  sectionsRes.rows.forEach((s, i) => sectionIdToIndex.set(s.id, i));

  const stepsWithMedia = stepsRes.rows.map((s, i) => ({
    ...s,
    media: stepMediaMap.get(String(s.id)) ?? [],
    after: (stepAfterMap.get(s.id) ?? (i > 0 ? [i - 1] : [])).sort(
      (a, b) => a - b,
    ),
    section: s.section_id != null
      ? (sectionIdToIndex.get(s.section_id) ?? null)
      : null,
  }));

  let outputIngredientName = "";
  if (recipe.output_ingredient_id) {
    const oRes = await query<{ name: string }>(
      "SELECT name FROM ingredients WHERE id = $1",
      [recipe.output_ingredient_id],
    );
    if (oRes.rows.length > 0) outputIngredientName = oRes.rows[0].name;
  }

  // Build per-section "after" arrays of section indices for the form
  const sectionIndexById = new Map<string, number>();
  sectionsRes.rows.forEach((s, i) => sectionIndexById.set(s.id, i));
  const sectionAfters = sectionsRes.rows.map(() => [] as number[]);
  for (const dep of sectionDepsRes.rows) {
    const sIdx = sectionIndexById.get(dep.section_id);
    const dIdx = sectionIndexById.get(dep.depends_on);
    if (sIdx != null && dIdx != null) sectionAfters[sIdx].push(dIdx);
  }
  sectionAfters.forEach((arr) => arr.sort((a, b) => a - b));

  return {
    recipe,
    ingredients: ingredientsRes.rows,
    tools: toolsRes.rows,
    steps: stepsWithMedia,
    sections: sectionsRes.rows.map((s, i) => ({
      title: s.title,
      key: s.key,
      after: sectionAfters[i],
    })),
    refs: refsRes.rows,
    mealTypes,
    dietaryTags,
    allIngredients: ingredientsListRes.rows,
    allTools: allToolsRes.rows,
    allRecipes: allRecipesRes.rows,
    outputIngredientName,
  };
}
