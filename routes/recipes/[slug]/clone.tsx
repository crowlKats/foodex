import { HttpError } from "fresh";
import { define } from "../../../utils.ts";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const slug = ctx.params.slug;
    const recipeRes = await ctx.state.db.query(
      `SELECT * FROM recipes WHERE slug = $1`,
      [slug],
    );
    if (recipeRes.rows.length === 0) throw new HttpError(404);
    const recipe = recipeRes.rows[0];

    // Generate a unique slug
    const originalTitle = String(recipe.title);
    const baseTitle = originalTitle.startsWith("Fork of ")
      ? originalTitle
      : `Fork of ${originalTitle}`;
    let newSlug = slugify(baseTitle);
    let suffix = 1;
    while (true) {
      const existing = await ctx.state.db.query(
        "SELECT id FROM recipes WHERE slug = $1",
        [newSlug],
      );
      if (existing.rows.length === 0) break;
      suffix++;
      newSlug = slugify(baseTitle) + `-${suffix}`;
    }

    // Track the original recipe: if the source is itself a fork, link to the root
    const forkedFromId = recipe.forked_from_id ?? recipe.id;

    // Clone recipe with fork attribution
    const newRecipeRes = await ctx.state.db.query(
      `INSERT INTO recipes (title, slug, description, quantity_type, quantity_value, quantity_unit, quantity_value2, quantity_value3, quantity_unit2, prep_time, cook_time, cover_image_id, difficulty, household_id, forked_from_id, source_type, source_name, source_url, output_ingredient_id, output_amount, output_unit, output_expires_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING id`,
      [
        baseTitle,
        newSlug,
        recipe.description,
        recipe.quantity_type,
        recipe.quantity_value,
        recipe.quantity_unit,
        recipe.quantity_value2,
        recipe.quantity_value3,
        recipe.quantity_unit2,
        recipe.prep_time,
        recipe.cook_time,
        recipe.cover_image_id,
        recipe.difficulty,
        ctx.state.householdId,
        forkedFromId,
        recipe.source_type,
        recipe.source_name,
        recipe.source_url,
        recipe.output_ingredient_id,
        recipe.output_amount,
        recipe.output_unit,
        recipe.output_expires_days,
      ],
    );
    const newRecipeId = newRecipeRes.rows[0].id;

    // Clone ingredients
    const ingredientsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );
    for (const ing of ingredientsRes.rows) {
      await ctx.state.db.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, key, name, amount, unit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newRecipeId,
          ing.ingredient_id,
          ing.key,
          ing.name,
          ing.amount,
          ing.unit,
          ing.sort_order,
        ],
      );
    }

    // Clone tools
    const toolsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_tools WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );
    for (const tool of toolsRes.rows) {
      await ctx.state.db.query(
        `INSERT INTO recipe_tools (recipe_id, tool_id, usage_description, settings, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          newRecipeId,
          tool.tool_id,
          tool.usage_description,
          tool.settings,
          tool.sort_order,
        ],
      );
    }

    // Clone steps and their media
    const stepsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );
    const oldToNewStepId = new Map<string, string>();
    for (const step of stepsRes.rows) {
      const newStepRes = await ctx.state.db.query(
        `INSERT INTO recipe_steps (recipe_id, title, body, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [newRecipeId, step.title, step.body, step.sort_order],
      );
      const newStepId = newStepRes.rows[0].id;
      oldToNewStepId.set(String(step.id), String(newStepId));

      const mediaRes = await ctx.state.db.query(
        `SELECT * FROM recipe_step_media WHERE step_id = $1 ORDER BY sort_order`,
        [step.id],
      );
      for (const media of mediaRes.rows) {
        await ctx.state.db.query(
          `INSERT INTO recipe_step_media (step_id, media_id, sort_order)
           VALUES ($1, $2, $3)`,
          [newStepId, media.media_id, media.sort_order],
        );
      }
    }

    // Clone step dependencies
    const depsRes = await ctx.state.db.query(
      `SELECT sd.step_id, sd.depends_on
       FROM recipe_step_deps sd
       JOIN recipe_steps rs ON rs.id = sd.step_id
       WHERE rs.recipe_id = $1`,
      [recipe.id],
    );
    for (const dep of depsRes.rows) {
      const newStepId = oldToNewStepId.get(String(dep.step_id));
      const newDepId = oldToNewStepId.get(String(dep.depends_on));
      if (newStepId && newDepId) {
        await ctx.state.db.query(
          `INSERT INTO recipe_step_deps (step_id, depends_on) VALUES ($1, $2)`,
          [newStepId, newDepId],
        );
      }
    }

    // Clone references
    const refsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_references WHERE recipe_id = $1 ORDER BY sort_order, id`,
      [recipe.id],
    );
    for (const ref of refsRes.rows) {
      await ctx.state.db.query(
        `INSERT INTO recipe_references (recipe_id, referenced_recipe_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [newRecipeId, ref.referenced_recipe_id, ref.sort_order],
      );
    }

    // Clone tags
    const tagsRes = await ctx.state.db.query(
      `SELECT * FROM recipe_tags WHERE recipe_id = $1`,
      [recipe.id],
    );
    for (const tag of tagsRes.rows) {
      await ctx.state.db.query(
        `INSERT INTO recipe_tags (recipe_id, tag_type, tag_value)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [newRecipeId, tag.tag_type, tag.tag_value],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${newSlug}/edit` },
    });
  },
});
