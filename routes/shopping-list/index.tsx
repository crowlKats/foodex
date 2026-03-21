import { page } from "fresh";
import { define } from "../../utils.ts";
import ShoppingListView from "../../islands/ShoppingListView.tsx";
import type {
  Ingredient,
  ShoppingList,
  ShoppingListItem,
  Store,
} from "../../db/types.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    let listRes = await ctx.state.db.query<Pick<ShoppingList, "id">>(
      "SELECT id FROM shopping_lists WHERE household_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ctx.state.householdId],
    );
    if (listRes.rows.length === 0) {
      listRes = await ctx.state.db.query<Pick<ShoppingList, "id">>(
        "INSERT INTO shopping_lists (household_id) VALUES ($1) RETURNING id",
        [ctx.state.householdId],
      );
    }
    const listId = listRes.rows[0].id;

    const itemsRes = await ctx.state.db.query<ShoppingListItem>(
      `SELECT sli.*,
              r.title as recipe_title, r.slug as recipe_slug
       FROM shopping_list_items sli
       LEFT JOIN recipes r ON r.id = sli.recipe_id
       WHERE sli.shopping_list_id = $1
       ORDER BY sli.checked ASC, sli.sort_order ASC, sli.id ASC`,
      [listId],
    );

    const storesRes = ctx.state.householdId
      ? await ctx.state.db.query<Pick<Store, "id" | "name" | "currency">>(
        `SELECT s.id, s.name, s.currency FROM stores s
         JOIN household_stores hs ON hs.store_id = s.id
         WHERE hs.household_id = $1
         ORDER BY s.name`,
        [ctx.state.householdId],
      )
      : await ctx.state.db.query<Pick<Store, "id" | "name" | "currency">>(
        "SELECT id, name, currency FROM stores ORDER BY name",
      );

    const storeIds = storesRes.rows.map((r) => r.id);
    const ingredientIds = itemsRes.rows
      .filter((i) => i.ingredient_id != null)
      .map((i) => i.ingredient_id as number);

    const pricesMap: Record<string, { store_id: number; price: number; amount: number; unit: string; currency: string }[]> = {};
    if (ingredientIds.length > 0 && storeIds.length > 0) {
      const pricesRes = await ctx.state.db.query<{
        ingredient_id: number;
        store_id: number;
        price: number;
        amount: number | null;
        unit: string | null;
        currency: string;
      }>(
        `SELECT gp.ingredient_id, gp.store_id, gp.price, gp.amount,
                coalesce(gp.unit, g.unit) as unit, s.currency
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
        });
      }
    }

    const items = itemsRes.rows.map((i) => {
      let storeId = i.store_id;
      if (storeId == null && i.ingredient_id != null) {
        const prices = pricesMap[String(i.ingredient_id)];
        if (prices && prices.length > 0) {
          storeId = prices[0].store_id;
        }
      }
      return {
        id: i.id,
        ingredient_id: i.ingredient_id,
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        store_id: storeId,
        checked: i.checked,
        recipe_title: i.recipe_title ?? null,
        recipe_slug: i.recipe_slug ?? null,
      };
    });

    const stores = storesRes.rows.map((s) => ({
      id: s.id,
      name: s.name,
      currency: s.currency ?? "EUR",
    }));

    const ingredientsRes = await ctx.state.db.query<Pick<Ingredient, "id" | "name" | "unit">>(
      "SELECT id, name, unit FROM ingredients ORDER BY name",
    );

    const cookie = ctx.req.headers.get("cookie") ?? "";
    const vmMatch = cookie.match(/(?:^|;\s*)sl_view=(recipe|store)/);
    const viewMode = (vmMatch?.[1] ?? "store") as "recipe" | "store";

    ctx.state.pageTitle = "Shopping List";
    return page({
      items,
      stores,
      pricesMap,
      viewMode,
      ingredients: ingredientsRes.rows.map((i) => ({
        id: String(i.id),
        name: i.name,
        unit: i.unit ?? undefined,
      })),
    });
  },
});

export default define.page<typeof handler>(function ShoppingListPage({ data }) {
  const { items, stores, pricesMap, viewMode, ingredients } = data as {
    items: {
      id: number;
      ingredient_id: number | null;
      name: string;
      amount: number | null;
      unit: string | null;
      store_id: number | null;
      checked: boolean;
      recipe_title: string | null;
      recipe_slug: string | null;
    }[];
    stores: { id: number; name: string; currency: string }[];
    pricesMap: Record<string, { store_id: number; price: number; amount: number; unit: string; currency: string }[]>;
    viewMode: "recipe" | "store";
    ingredients: { id: string; name: string; unit?: string }[];
  };

  return (
    <div>
      <h1 class="text-2xl font-bold mb-4">Shopping List</h1>
      <ShoppingListView
        initialItems={items}
        stores={stores}
        pricesMap={pricesMap}
        initialViewMode={viewMode}
        ingredients={ingredients}
      />
    </div>
  );
});
