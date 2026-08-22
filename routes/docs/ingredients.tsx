import { handler, page } from "./$ingredients.ts";
import {
  DocNote,
  docProse,
  DocSection,
  DocsPage,
  DocSub,
} from "../../components/DocsPage.tsx";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import en from "../../components/DocsPage.en.mfr";
import it from "../../components/DocsPage.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "docs.ingredientsTitle",
    ).format();
    return { data: {} };
  },
});

export default page(function IngredientsDocs({ url }) {
  const trans = t.use();
  return (
    <DocsPage
      currentPath={url.pathname}
      title={trans("docs.ingredientsTitle")}
      intro="The shared ingredient catalog that connects recipes, pantry, and shopping, and the price data that powers cost estimates."
    >
      <DocSection id="catalog" title="The Ingredient Catalog">
        <p class={`${docProse} mb-3`}>
          Foodex keeps one shared catalog of ingredients. When a recipe says
          "flour", your pantry says "flour", and your shopping list says
          "flour", they all point at the same catalog entry. That link is what
          makes the app smart: it's how Foodex knows the flour in your pantry
          satisfies the flour in a recipe.
        </p>
        <p class={`${docProse} mb-0`}>
          The catalog is shared across all households and openly editable, like
          a wiki: anyone can add ingredients, fix names, and record prices, and
          everyone benefits.
        </p>
      </DocSection>

      <DocSection id="adding" title="Adding and Editing Ingredients">
        <p class={`${docProse} mb-3`}>
          Ingredients get created wherever you need them: in the recipe editor,
          the pantry, or the barcode scanner, as well as on the Ingredients page
          itself. An ingredient has:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            A <strong>name</strong>.
          </li>
          <li class={docProse}>
            A default <strong>unit</strong>{" "}
            (grams, milliliters, pieces, and so on).
          </li>
          <li class={docProse}>
            An optional{" "}
            <strong>density</strong>, which unlocks conversion between weight
            and volume (see below).
          </li>
          <li class={docProse}>
            <strong>Brands</strong>, if you care to distinguish them.
          </li>
          <li class={docProse}>
            An <strong>always on hand</strong>{" "}
            flag for staples like water and salt: they scale in recipes but are
            never bought or counted as missing.
          </li>
        </ul>
        <DocNote title="Advanced: unit conversion">
          <p>
            Foodex converts between compatible units automatically: a recipe
            wanting 0.5kg is satisfied by 500g in the pantry. With a density
            set, it also converts across weight and volume, so 250ml of honey
            can count against a recipe that wants 340g. Everything then displays
            in your preferred unit system (metric or imperial), whatever units
            the recipe was written in.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="prices" title="Recording Prices">
        <p class={`${docProse} mb-3`}>
          On an ingredient's page you can record what it costs where:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            Pick a <strong>store</strong> and optionally a{" "}
            <strong>brand</strong>.
          </li>
          <li class={docProse}>
            Enter the <strong>price</strong> and the <strong>amount</strong>
            {" "}
            it buys, like $2.50 per 500g. Foodex works out unit prices from
            that, so pack sizes don't matter.
          </li>
        </ul>
        <p class={`${docProse} mb-4`}>
          Prices also flow in as you live: the barcode scanner and the shopping
          list both let you record the price you actually paid while you're at
          it. You don't have to enter prices in bulk; add them as you shop, and
          estimates sharpen over time.
        </p>

        <DocSub title="What Prices Power">
          <ul class="list-disc pl-6 space-y-1 mb-0">
            <li class={docProse}>
              <strong>Recipe cost estimates</strong>: per-ingredient and total
              cost on every recipe, scaled with the servings.
            </li>
            <li class={docProse}>
              <strong>Shopping totals</strong>: per-store subtotals and a
              running total as you tick things off.
            </li>
            <li class={docProse}>
              <strong>Cheapest-store suggestions</strong>{" "}
              when the list groups by store.
            </li>
          </ul>
        </DocSub>
      </DocSection>

      <DocSection id="merge" title="Merging Duplicate Ingredients">
        <p class={`${docProse} mb-0`}>
          A shared catalog accumulates duplicates ("flour", "all-purpose flour",
          "Flour"). Merging combines two entries into one and repoints
          everything that referenced the duplicate: recipes, pantry items,
          prices, and shopping lines all follow automatically. Merge generously;
          one well-connected entry beats three fragmented ones, because pantry
          matching only works when everyone points at the same entry.
        </p>
      </DocSection>
    </DocsPage>
  );
});
