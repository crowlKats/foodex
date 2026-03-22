import { page } from "fresh";
import { define } from "../utils.ts";
import type { Ingredient, Store } from "../db/types.ts";
import ScanView from "../islands/ScanView.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const [ingredientsRes, storesRes] = await Promise.all([
      ctx.state.db.query<Pick<Ingredient, "id" | "name" | "unit">>(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      ),
      ctx.state.db.query<Pick<Store, "id" | "name">>(
        "SELECT id, name FROM stores ORDER BY name",
      ),
    ]);

    ctx.state.pageTitle = "Scan";
    return page({
      householdId: ctx.state.householdId,
      ingredients: ingredientsRes.rows,
      stores: storesRes.rows,
    });
  },
});

export default define.page<typeof handler>(function ScanPage({ data }) {
  return (
    <ScanView
      mode="page"
      householdId={data.householdId}
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
  );
});
