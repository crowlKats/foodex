import { define } from "../../utils.ts";
import { generateRecipeFromPantry } from "../../lib/generate-recipe.ts";
import type { PantryItem } from "../../db/types.ts";

export const handler = define.handlers({
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await ctx.req.json();
    const maxMinutes = body.max_minutes ? Number(body.max_minutes) : undefined;
    const instructions = body.instructions as string | undefined;

    const pantryRes = await ctx.state.db.query<PantryItem>(
      "SELECT name, amount, unit FROM pantry_items WHERE household_id = $1",
      [ctx.state.householdId],
    );

    if (pantryRes.rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Your pantry is empty" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const ingredients = pantryRes.rows.map((r) => ({
      name: r.name,
      amount: r.amount ?? undefined,
      unit: r.unit ?? undefined,
    }));

    try {
      const { recipe, usage } = await generateRecipeFromPantry(ingredients, {
        maxMinutes,
        instructions,
      });

      await ctx.state.db.query(
        `INSERT INTO ocr_usage (user_id, input_tokens, output_tokens, model)
         VALUES ($1, $2, $3, $4)`,
        [ctx.state.user.id, usage.input_tokens, usage.output_tokens, usage.model],
      );

      return new Response(JSON.stringify(recipe), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: (err as Error).message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
});
