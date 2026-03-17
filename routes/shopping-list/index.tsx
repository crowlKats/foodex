import { page } from "fresh";
import { define } from "../../utils.ts";
import ShoppingListView from "../../islands/ShoppingListView.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    // Get or create list
    let listRes = await ctx.state.db.query(
      "SELECT id FROM shopping_lists WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ctx.state.user.id],
    );
    if (listRes.rows.length === 0) {
      listRes = await ctx.state.db.query(
        "INSERT INTO shopping_lists (user_id) VALUES ($1) RETURNING id",
        [ctx.state.user.id],
      );
    }
    const listId = listRes.rows[0].id as number;

    // Fetch items with recipe info
    const itemsRes = await ctx.state.db.query(
      `SELECT sli.*,
              r.title as recipe_title, r.slug as recipe_slug
       FROM shopping_list_items sli
       LEFT JOIN recipes r ON r.id = sli.recipe_id
       WHERE sli.shopping_list_id = $1
       ORDER BY sli.checked ASC, sli.sort_order ASC, sli.id ASC`,
      [listId],
    );

    // Fetch all stores
    const storesRes = await ctx.state.db.query(
      "SELECT id, name, currency FROM stores ORDER BY name",
    );

    // Fetch prices for all linked ingredients
    const ingredientIds = itemsRes.rows
      .filter((i) => i.ingredient_id != null)
      .map((i) => Number(i.ingredient_id));

    const pricesMap: Record<string, { store_id: number; price: number; amount: number; unit: string; currency: string }[]> = {};
    if (ingredientIds.length > 0) {
      const pricesRes = await ctx.state.db.query(
        `SELECT gp.ingredient_id, gp.store_id, gp.price, gp.amount,
                coalesce(gp.unit, g.unit) as unit, s.currency
         FROM ingredient_prices gp
         JOIN stores s ON s.id = gp.store_id
         JOIN ingredients g ON g.id = gp.ingredient_id
         WHERE gp.ingredient_id = ANY($1)
         ORDER BY gp.ingredient_id, gp.price ASC`,
        [ingredientIds],
      );
      for (const row of pricesRes.rows) {
        const key = String(row.ingredient_id);
        if (!pricesMap[key]) pricesMap[key] = [];
        pricesMap[key].push({
          store_id: Number(row.store_id),
          price: Number(row.price),
          amount: Number(row.amount) || 1,
          unit: String(row.unit ?? ""),
          currency: String(row.currency ?? "EUR"),
        });
      }
    }

    const items = itemsRes.rows.map((i) => {
      let storeId = i.store_id != null ? Number(i.store_id) : null;
      // Default to cheapest store if none selected
      if (storeId == null && i.ingredient_id != null) {
        const prices = pricesMap[String(i.ingredient_id)];
        if (prices && prices.length > 0) {
          storeId = prices[0].store_id; // sorted by price ASC
        }
      }
      return {
        id: Number(i.id),
        ingredient_id: i.ingredient_id != null ? Number(i.ingredient_id) : null,
        name: String(i.name),
        amount: i.amount != null ? Number(i.amount) : null,
        unit: i.unit ? String(i.unit) : null,
        store_id: storeId,
        checked: Boolean(i.checked),
        recipe_title: i.recipe_title ? String(i.recipe_title) : null,
        recipe_slug: i.recipe_slug ? String(i.recipe_slug) : null,
      };
    });

    const stores = storesRes.rows.map((s) => ({
      id: Number(s.id),
      name: String(s.name),
      currency: String(s.currency ?? "EUR"),
    }));

    // Read view mode from cookie
    const cookie = ctx.req.headers.get("cookie") ?? "";
    const vmMatch = cookie.match(/(?:^|;\s*)sl_view=(recipe|store)/);
    const viewMode = (vmMatch?.[1] ?? "recipe") as "recipe" | "store";

    return page({ items, stores, pricesMap, viewMode });
  },
});

export default define.page<typeof handler>(function ShoppingListPage({ data }) {
  const { items, stores, pricesMap, viewMode } = data as {
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
  };

  return (
    <div>
      <h1 class="text-2xl font-bold mb-4">Shopping List</h1>
      <ShoppingListView
        initialItems={items}
        stores={stores}
        pricesMap={pricesMap}
        initialViewMode={viewMode}
      />
    </div>
  );
});
