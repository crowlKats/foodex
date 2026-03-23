import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import type { ShoppingList, ShoppingListItem } from "../../../db/types.ts";
import SharedShoppingList from "../../../islands/SharedShoppingList.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const token = ctx.params.token;

    const listRes = await ctx.state.db.query<
      Pick<ShoppingList, "id" | "name">
    >(
      "SELECT id, name FROM shopping_lists WHERE share_token = $1 AND (share_token_expires_at IS NULL OR share_token_expires_at > now())",
      [token],
    );
    if (listRes.rows.length === 0) throw new HttpError(404);
    const list = listRes.rows[0];

    const itemsRes = await ctx.state.db.query<ShoppingListItem>(
      `SELECT sli.*,
              r.title as recipe_title, r.slug as recipe_slug
       FROM shopping_list_items sli
       LEFT JOIN recipes r ON r.id = sli.recipe_id
       WHERE sli.shopping_list_id = $1
       ORDER BY sli.checked ASC, sli.sort_order ASC, sli.id ASC`,
      [list.id],
    );

    const items = itemsRes.rows.map((i) => ({
      id: i.id,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      checked: i.checked,
      recipe_title: i.recipe_title ?? null,
    }));

    ctx.state.pageTitle = list.name;
    return page({ items, token, listName: list.name });
  },
});

export default define.page<typeof handler>(function SharedShoppingListPage({
  data,
}) {
  return (
    <div class="max-w-lg mx-auto">
      <h1 class="text-2xl font-bold mb-1">{data.listName}</h1>
      <p class="text-sm text-stone-500 mb-4">Shared shopping list</p>
      <SharedShoppingList
        initialItems={data.items}
        token={data.token}
      />
    </div>
  );
});
