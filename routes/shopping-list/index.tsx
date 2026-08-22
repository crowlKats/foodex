import { handler, page } from "./$index.ts";
import ShoppingListView from "../../islands/ShoppingListView.tsx";
import { projectShoppingList } from "../../lib/shopping-list.ts";
import type { Ingredient, Store } from "../../db/types.ts";
import { pickBundle } from "../../lib/i18n/locale.ts";
import en from "./index.en.mfr";
import it from "./index.it.mfr";

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    // The list is derived on every load: planned meals + manual demands, minus
    // what's in the pantry, minus what's already been bought.
    const projected = await projectShoppingList(
      ctx.state.db,
      ctx.state.householdId,
    );

    const [storesRes, ingredientsRes] = await Promise.all([
      ctx.state.db.query<Pick<Store, "id" | "name" | "currency">>(
        `SELECT s.id, s.name, s.currency FROM stores s
         JOIN household_stores hs ON hs.store_id = s.id
         WHERE hs.household_id = $1
         ORDER BY s.name`,
        [ctx.state.householdId],
      ),
      ctx.state.db.query<Pick<Ingredient, "id" | "name" | "unit">>(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      ),
    ]);

    const storeIds = storesRes.rows.map((r) => r.id);
    const ingredientIds = projected.lines
      .map((l) => l.ingredient_id)
      .filter((id): id is string => id != null);

    const pricesMap: Record<
      string,
      {
        store_id: string;
        price: number;
        amount: number;
        unit: string;
        currency: string;
        density: number | null;
      }[]
    > = {};
    if (ingredientIds.length > 0 && storeIds.length > 0) {
      const pricesRes = await ctx.state.db.query<{
        ingredient_id: string;
        store_id: string;
        price: number;
        amount: number | null;
        unit: string | null;
        currency: string;
        density: number | null;
      }>(
        `SELECT gp.ingredient_id, gp.store_id, gp.price, gp.amount,
                coalesce(gp.unit, g.unit) as unit, s.currency, g.density
         FROM ingredient_prices gp
         JOIN stores s ON s.id = gp.store_id
         JOIN ingredients g ON g.id = gp.ingredient_id
         WHERE gp.ingredient_id = ANY($1) AND gp.store_id = ANY($2)
         ORDER BY gp.ingredient_id, gp.price ASC`,
        [ingredientIds, storeIds],
      );
      for (const row of pricesRes.rows) {
        const key = String(row.ingredient_id);
        if (!pricesMap[key]) pricesMap[key] = [];
        pricesMap[key].push({
          store_id: row.store_id,
          price: row.price,
          amount: row.amount || 1,
          unit: row.unit ?? "",
          currency: row.currency ?? "EUR",
          density: row.density,
        });
      }
    }

    const cookie = ctx.req.headers.get("cookie") ?? "";
    const vmMatch = cookie.match(/(?:^|;\s*)sl_view=(source|store)/);
    const viewMode = (vmMatch?.[1] ?? "store") as "source" | "store";

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "shopping.title",
    ).format();
    return {
      data: {
        lines: projected.lines,
        stores: storesRes.rows.map((s) => ({
          id: s.id,
          name: s.name,
          currency: s.currency ?? "EUR",
        })),
        pricesMap,
        viewMode,
        shareToken: projected.shareToken,
        ingredients: ingredientsRes.rows.map((i) => ({
          id: String(i.id),
          name: i.name,
          unit: i.unit ?? undefined,
        })),
      },
    };
  },
});

export default page(function ShoppingListPage({ data }) {
  return (
    <div>
      <div class="flex items-baseline justify-between mb-6">
        <h1 class="text-2xl font-bold">Shopping List</h1>
        <a href="/plan" class="link text-sm">Meal plan →</a>
      </div>
      <ShoppingListView
        initialLines={data.lines}
        stores={data.stores}
        pricesMap={data.pricesMap}
        initialViewMode={data.viewMode}
        ingredients={data.ingredients}
        initialShareToken={data.shareToken}
      />
    </div>
  );
});
