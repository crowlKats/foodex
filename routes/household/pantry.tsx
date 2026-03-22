import { page } from "fresh";
import { define } from "../../utils.ts";
import PantryManager from "../../islands/PantryManager.tsx";
import GenerateRecipe from "../../islands/GenerateRecipe.tsx";
import type {
  Household,
  Ingredient,
  PantryItem,
  Store,
} from "../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const id = ctx.state.householdId;

    const [householdRes, pantryRes, ingredientsRes, storesRes] = await Promise
      .all([
        ctx.state.db.query<Household>(
          "SELECT * FROM households WHERE id = $1",
          [id],
        ),
        ctx.state.db.query<PantryItem>(
          "SELECT * FROM pantry_items WHERE household_id = $1 ORDER BY name",
          [id],
        ),
        ctx.state.db.query<Pick<Ingredient, "id" | "name" | "unit">>(
          "SELECT id, name, unit FROM ingredients ORDER BY name",
        ),
        ctx.state.db.query<Pick<Store, "id" | "name">>(
          "SELECT id, name FROM stores ORDER BY name",
        ),
      ]);

    ctx.state.pageTitle = "Pantry";
    return page({
      household: householdRes.rows[0],
      pantryItems: pantryRes.rows,
      ingredients: ingredientsRes.rows,
      stores: storesRes.rows,
    });
  },
});

export default define.page<typeof handler>(function PantryPage({ data }) {
  return (
    <div>
      <div class="mb-6">
        <a
          href="/household"
          class="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          &larr; {data.household.name}
        </a>
        <h1 class="text-2xl font-bold">Pantry</h1>
        <p class="text-sm text-stone-500 mt-1">
          Track what ingredients your household already has on hand.
        </p>
      </div>

      <PantryManager
        householdId={data.household.id}
        initialItems={data.pantryItems.map((p) => ({
          id: p.id,
          ingredient_id: p.ingredient_id ?? undefined,
          name: p.name,
          amount: p.amount ?? undefined,
          unit: p.unit ?? undefined,
          expires_at: p.expires_at ?? undefined,
        }))}
        ingredients={data.ingredients.map((i) => ({
          id: String(i.id),
          name: i.name,
          unit: i.unit ?? undefined,
        }))}
        stores={data.stores.map((s) => ({
          id: String(s.id),
          name: s.name,
        }))}
      />

      {data.pantryItems.length > 0 && (
        <div class="mt-8">
          <GenerateRecipe />
        </div>
      )}
    </div>
  );
});
