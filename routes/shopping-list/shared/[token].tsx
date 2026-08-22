import { handler, page } from "./$[token].ts";
import { HttpError } from "fresh/errors";
import { projectShoppingList } from "../../../lib/shopping-list.ts";
import SharedShoppingList from "../../../islands/SharedShoppingList.tsx";
import { catalogFor } from "../../../lib/i18n/mod.ts";

export const handlers = handler({
  async GET(ctx) {
    const token = ctx.params.token;

    const listRes = await ctx.state.db.query<
      { id: string; household_id: string; household_name: string }
    >(
      `SELECT sl.id, sl.household_id, h.name as household_name
       FROM shopping_lists sl
       JOIN households h ON h.id = sl.household_id
       WHERE sl.share_token = $1
         AND (sl.share_token_expires_at IS NULL OR sl.share_token_expires_at > now())`,
      [token],
    );
    if (listRes.rows.length === 0) throw new HttpError(404);
    const list = listRes.rows[0];

    // Same projection the household sees, so a shared shopper is working from
    // the real list rather than a frozen copy of it.
    const projected = await projectShoppingList(
      ctx.state.db,
      list.household_id,
    );

    ctx.state.pageTitle = catalogFor(ctx.state.locale).shopping.title();
    return {
      data: {
        lines: projected.lines.map((line) => ({
          key: line.key,
          ingredient_id: line.ingredient_id,
          name: line.name,
          amount: line.purchase ? line.purchase.amount : line.needed,
          unit: (line.purchase ? line.purchase.unit : line.unit) ?? null,
          bought: line.purchase != null,
          sources: line.sources
            .filter((s) => s.kind === "plan")
            .map((s) => s.label),
        })),
        token,
        listName: `${list.household_name} shopping list`,
      },
    };
  },
});

export default page(function SharedShoppingListPage({ data }) {
  return (
    <div class="max-w-lg mx-auto">
      <h1 class="text-2xl font-bold mb-1">{data.listName}</h1>
      <p class="text-sm text-stone-500 mb-4">
        Ticking something off adds it to their pantry.
      </p>
      <SharedShoppingList initialLines={data.lines} token={data.token} />
    </div>
  );
});
