import { page, HttpError } from "fresh";
import { define } from "../../../utils.ts";
import PantryManager from "../../../islands/PantryManager.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const id = parseInt(ctx.params.id);

    const memberCheck = await ctx.state.db.query(
      "SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2",
      [id, ctx.state.user.id],
    );
    if (memberCheck.rows.length === 0) {
      throw new HttpError(404);
    }

    const householdRes = await ctx.state.db.query(
      "SELECT * FROM households WHERE id = $1",
      [id],
    );
    if (householdRes.rows.length === 0) {
      throw new HttpError(404);
    }

    const pantryRes = await ctx.state.db.query(
      `SELECT * FROM pantry_items WHERE household_id = $1 ORDER BY name`,
      [id],
    );

    const ingredientsRes = await ctx.state.db.query(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );

    return page({
      household: householdRes.rows[0],
      pantryItems: pantryRes.rows,
      ingredients: ingredientsRes.rows,
      householdId: id,
    });
  },
});

export default define.page<typeof handler>(function PantryPage({ data }) {
  const { household, pantryItems, ingredients, householdId } = data as {
    household: Record<string, unknown>;
    pantryItems: Record<string, unknown>[];
    ingredients: Record<string, unknown>[];
    householdId: number;
  };

  return (
    <div>
      <div class="mb-6">
        <a
          href={`/households/${householdId}`}
          class="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          &larr; {String(household.name)}
        </a>
        <h1 class="text-2xl font-bold">Pantry</h1>
        <p class="text-sm text-stone-500 mt-1">
          Track what ingredients your household already has on hand.
        </p>
      </div>

      <PantryManager
        householdId={householdId}
        initialItems={pantryItems.map((p) => ({
          id: Number(p.id),
          ingredient_id: p.ingredient_id ? Number(p.ingredient_id) : undefined,
          name: String(p.name),
          amount: p.amount != null ? Number(p.amount) : undefined,
          unit: p.unit ? String(p.unit) : undefined,
        }))}
        ingredients={ingredients.map((i) => ({
          id: String(i.id),
          name: String(i.name),
          unit: i.unit ? String(i.unit) : undefined,
        }))}
      />
    </div>
  );
});
