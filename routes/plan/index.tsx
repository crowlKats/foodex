import { handler, page } from "./$index.ts";
import PlanView from "../../islands/PlanView.tsx";
import { loadCookHistory, loadPlan, suggestRecipes } from "../../lib/plan.ts";
import { expiringSoon, loadStock } from "../../lib/pantry.ts";

const WARN_DAYS = 3;

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const householdId = ctx.state.householdId;
    const stock = await loadStock(ctx.state.db, householdId);
    const expiring = expiringSoon(stock, WARN_DAYS);

    const [entries, history, suggestions] = await Promise.all([
      loadPlan(ctx.state.db, householdId),
      loadCookHistory(ctx.state.db, householdId, 10),
      // What to cook next, ranked by what's about to go off.
      suggestRecipes(ctx.state.db, householdId, stock, expiring),
    ]);

    ctx.state.pageTitle = "Meal Plan";
    return {
      data: {
        entries,
        history,
        suggestions,
        expiring: expiring.map((e) => ({
          name: e.name,
          expires_at: e.expires_at,
        })),
      },
    };
  },
});

export default page(function PlanPage({ data }) {
  return (
    <div>
      <div class="flex items-baseline justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Meal Plan</h1>
          <p class="text-sm text-stone-500 mt-1">
            What you're cooking. Anything the pantry can't cover lands on the
            shopping list.
          </p>
        </div>
        <a href="/shopping-list" class="link text-sm">Shopping list →</a>
      </div>

      <PlanView
        initialEntries={data.entries}
        history={data.history}
        suggestions={data.suggestions}
        expiring={data.expiring}
      />
    </div>
  );
});
