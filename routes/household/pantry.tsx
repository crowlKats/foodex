import { page } from "fresh";
import { define } from "../../utils.ts";
import PantryManager from "../../islands/PantryManager.tsx";
import GenerateRecipe from "../../islands/GenerateRecipe.tsx";
import type { Household, Ingredient, PantryItem } from "../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = ctx.state.householdId;

    const [householdRes, pantryRes, ingredientsRes] = await Promise.all([
      ctx.state.db.query<Household>("SELECT * FROM households WHERE id = $1", [id]),
      ctx.state.db.query<PantryItem>(
        "SELECT * FROM pantry_items WHERE household_id = $1 ORDER BY name",
        [id],
      ),
      ctx.state.db.query<Pick<Ingredient, "id" | "name" | "unit">>(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      ),
    ]);

    ctx.state.pageTitle = "Pantry";
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
    household: Household;
    pantryItems: PantryItem[];
    ingredients: Pick<Ingredient, "id" | "name" | "unit">[];
    householdId: number;
  };

  return (
    <div>
      <div class="mb-6">
        <a
          href="/household"
          class="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          &larr; {household.name}
        </a>
        <h1 class="text-2xl font-bold">Pantry</h1>
        <p class="text-sm text-stone-500 mt-1">
          Track what ingredients your household already has on hand.
        </p>
      </div>

      <PantryManager
        householdId={householdId}
        initialItems={pantryItems.map((p) => ({
          id: p.id,
          ingredient_id: p.ingredient_id ?? undefined,
          name: p.name,
          amount: p.amount ?? undefined,
          unit: p.unit ?? undefined,
        }))}
        ingredients={ingredients.map((i) => ({
          id: String(i.id),
          name: i.name,
          unit: i.unit ?? undefined,
        }))}
      />

      {pantryItems.length > 0 && (
        <div class="mt-8">
          <GenerateRecipe />
        </div>
      )}
    </div>
  );
});
