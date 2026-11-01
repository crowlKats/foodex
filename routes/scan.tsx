import { handler, page } from "./$scan.ts";
import type { Ingredient, Store } from "../db/types.ts";
import ScanView from "../islands/ScanView.tsx";
import { pickBundle } from "../lib/i18n/locale.ts";
import en from "./scan.en.mfr";
import it from "./scan.it.mfr";

export const handlers = handler({
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

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "scan.title",
    ).format();
    return {
      data: {
        householdId: ctx.state.householdId,
        ingredients: ingredientsRes.rows,
        stores: storesRes.rows,
      },
    };
  },
});

export default page(function ScanPage({ data }) {
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
