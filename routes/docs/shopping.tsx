import { handler, page } from "./$shopping.ts";
import { catalogFor } from "../../lib/i18n/mod.ts";
import { useMessages } from "../../lib/i18n/provider.tsx";
import {
  docMuted,
  DocNote,
  docProse,
  DocSection,
  DocsPage,
  DocSub,
} from "../../components/DocsPage.tsx";

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = catalogFor(ctx.state.locale).docs.shoppingTitle();
    return { data: {} };
  },
});

export default page(function ShoppingDocs({ url }) {
  const m = useMessages();
  return (
    <DocsPage
      currentPath={url.pathname}
      title={m.docs.shoppingTitle()}
      intro="One list per household, worked out for you: what your plan needs, minus what you already have."
    >
      <DocSection id="how" title="How the List Is Worked Out">
        <p class={`${docProse} mb-4`}>
          Your shopping list isn't a list you maintain; it's computed. Foodex
          takes everything on your meal plan, adds anything you've asked for by
          hand, subtracts what's in the pantry and what's already been bought,
          and shows what's left:
        </p>
        <div class="card mb-4 text-center font-medium">
          planned meals + one-off items &minus; pantry &minus; already bought
        </div>
        <p class={`${docProse} mb-4`}>
          Because it's recomputed every time you look, it can't go stale. Change
          a meal from four servings to eight and the amounts grow. Buy half the
          flour and the line shrinks. Plan the same recipe twice and it asks for
          twice as much, instead of assuming one jar can cover both.
        </p>
        <DocNote title="What lands on the list">
          <p>
            Two things and only two things put items on the list: planning a
            meal (see{" "}
            <a href="/docs/plan" class="link">Meal plan</a>) and adding a
            one-off by hand (washing-up liquid, more coffee). Staples never
            appear, "made while cooking" ingredients never appear, and a planned
            meal can be excluded with its "On the shopping list" checkbox.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="using" title="In the Store">
        <DocSub title="Two Views">
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={docProse}>
              <strong>By store</strong>: organized by where you buy each thing.
              Foodex remembers which shop your household picked for an
              ingredient, and suggests the cheapest known one otherwise. The
              same ingredient wanted by several meals is merged into one line.
            </li>
            <li class={docProse}>
              <strong>By meal</strong>: organized by which planned meal wants
              each item, so you can shop for just tonight.
            </li>
          </ul>
        </DocSub>

        <DocSub title="Ticking Things Off">
          <p class={`${docProse} mb-3`}>
            Ticking a line means{" "}
            <em>bought</em>, and buying is real: the item goes straight into
            your pantry, every meal that needed it gets closer to ready, and the
            line disappears from the remaining demand. Untick it and the pantry
            goes back exactly as it was.
          </p>
          <p class={`${docProse} mb-4`}>
            If prices are known you'll see per-store subtotals and a running
            total as you shop. You can record the store and price as you tick,
            which also keeps the price catalog fresh for next time.
          </p>
        </DocSub>

        <DocSub title="Checked Items">
          <p class={`${docProse} mb-0`}>
            Checked-off items stay visible (so you can untick a mistake) until
            you clear them in bulk.
          </p>
        </DocSub>
      </DocSection>

      <DocSection id="sharing" title="Sending Someone Else">
        <p class={`${docProse} mb-3`}>
          Need someone to pick things up on their way over? Generate a{" "}
          <strong>share link</strong>. Anyone with the link sees the live list
          and can tick things off as they shop, no Foodex account needed, and
          what they buy lands in your pantry just as if you'd done it yourself.
        </p>
        <p class={`${docMuted} mb-0`}>
          Household members don't need the link; the list is already shared
          within the household, live for everyone at once.
        </p>
      </DocSection>
    </DocsPage>
  );
});
