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

/** Everything the recipe edit form needs to render. */
export type RecipeEditData = Awaited<
  ReturnType<typeof loadRecipeEditData>
> extends infer T ? T extends null ? never : T : never;

/**
 * Adapt RecipeEditData to the shape the shared RecipeFields editor seeds from
 * (the AgentRecipe layout: step deps by step id, step sections by section key).
 */
export function editDataToRecipeFields(
  d: RecipeEditData,
): Record<string, unknown> {
  const r = d.recipe;
  return {
    title: r.title,
    description: r.description,
    quantity_type: r.quantity_type,
    quantity_value: r.quantity_value,
    quantity_unit: r.quantity_unit,
    quantity_value2: r.quantity_value2,
    quantity_value3: r.quantity_value3,
    quantity_unit2: r.quantity_unit2,
    prep_time: r.prep_time,
    cook_time: r.cook_time,
    rest_time: r.rest_time,
    difficulty: r.difficulty,
    private: r.private,
    source_type: r.source_type,
    source_name: r.source_name,
    source_url: r.source_url,
    output_ingredient_id: r.output_ingredient_id
      ? String(r.output_ingredient_id)
      : null,
    output_amount: r.output_amount,
    output_unit: r.output_unit,
    output_expires_days: r.output_expires_days,
    meal_types: d.mealTypes,
    dietary_tags: d.dietaryTags,
    ingredients: d.ingredients.map((i) => ({
      key: i.key ?? "",
      name: i.name,
      amount: i.amount != null ? String(i.amount) : "",
      unit: i.unit ?? "",
      ingredient_id: i.ingredient_id != null ? String(i.ingredient_id) : "",
      always_on_hand: !!i.always_on_hand,
    })),
    sections: d.sections.map((s) => ({
      key: s.key,
      title: s.title,
      after: s.after
        .map((idx) => d.sections[idx]?.key)
        .filter((k): k is string => !!k),
    })),
    steps: d.steps.map((s) => ({
      id: String(s.id),
      title: s.title ?? "",
      body: s.body ?? "",
      section: s.section != null ? d.sections[s.section]?.key ?? null : null,
      after: s.after
        .map((idx) => d.steps[idx]?.id)
        .filter((id): id is string => id != null)
        .map(String),
      media: s.media,
    })),
    tools: d.tools.map((t) => ({
      tool_id: String(t.tool_id),
      tool_name: t.tool_name ?? "",
      usage_description: t.usage_description,
      settings: t.settings,
    })),
    refs: d.refs.map((ref) => ({
      referenced_recipe_id: String(ref.referenced_recipe_id),
    })),
  };
}

export async function loadRecipeEditData(
  query: QueryFn,
  slug: string,
  householdId: string | null,
) {
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
    `SELECT id, title, slug FROM recipes
     WHERE id != $1 AND (private = false OR household_id = $2)
     ORDER BY title`,
    [recipe.id, householdId],
  );

  // Dish picker options: dishes with at least one recipe the editor may see,
  // plus this recipe's own dish (which might otherwise be invisible when the
  // recipe is private and the group's only member).
  const allDishesRes = await query<{ id: string; name: string }>(
    `SELECT d.id, d.name FROM dishes d
     WHERE d.id = $1 OR EXISTS (
       SELECT 1 FROM recipes r WHERE r.dish_id = d.id
         AND (r.private = false OR r.household_id = $2)
     )
     ORDER BY d.name`,
    [recipe.dish_id, householdId],
  );
  const dishName = recipe.dish_id
    ? allDishesRes.rows.find((di) => di.id === recipe.dish_id)?.name ?? null
    : null;

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
    allDishes: allDishesRes.rows,
    dishName,
    outputIngredientName,
  };
}
