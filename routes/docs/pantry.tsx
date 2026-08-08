import { handler, page } from "./$pantry.ts";
import {
  docMuted,
  DocNote,
  docProse,
  DocSection,
  DocsPage,
} from "../../components/DocsPage.tsx";

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = "Pantry";
    return { data: {} };
  },
});

export default page(function PantryDocs({ url }) {
  return (
    <DocsPage
      currentPath={url.pathname}
      title="Pantry"
      intro="Your household's shared inventory: what's in the kitchen, when it expires, and how stock moves in and out."
    >
      <DocSection id="basics" title="How the Pantry Works">
        <p class={`${docProse} mb-3`}>
          The pantry is one shared inventory for your whole household. It's what
          lets Foodex answer questions for you: which recipes are ready to make,
          what a planned meal is missing, and what actually needs to go on the
          shopping list.
        </p>
        <p class={`${docProse} mb-0`}>
          You don't have to track everything you own for it to be useful. Start
          with what you buy this week; the pantry mostly maintains itself from
          there, because buying and cooking through Foodex update it
          automatically.
        </p>
      </DocSection>

      <DocSection id="adding" title="Adding Items">
        <p class={`${docProse} mb-3`}>On the Pantry page:</p>
        <ol class="list-decimal pl-6 space-y-1 mb-3">
          <li class={docProse}>
            Search for the ingredient. If it's not in the catalog yet, you can
            create it on the spot.
          </li>
          <li class={docProse}>
            Set the amount and unit (500g of flour, 2L of milk). Amounts are
            optional if you just want "we have some".
          </li>
          <li class={docProse}>
            Optionally set a <strong>best-before date</strong>.
          </li>
        </ol>
        <p class={`${docProse} mb-0`}>
          Items also arrive on their own: ticking something off the shopping
          list adds it, and cooking a recipe with an output (a stock, a dough)
          books the product in. See below for where stock comes from and goes.
        </p>
      </DocSection>

      <DocSection id="scanning" title="Barcode Scanning">
        <p class={`${docProse} mb-3`}>
          The fastest way to fill the pantry is the scanner: the{" "}
          <strong>Scan</strong>{" "}
          tab on your phone (or the Scan Barcode button on the Pantry page).
          When you get home from shopping:
        </p>
        <ol class="list-decimal pl-6 space-y-1 mb-3">
          <li class={docProse}>
            Point the camera at a product's barcode. There's a flashlight button
            for dim kitchens, a camera-switch button, and a field to type the
            number by hand if a code won't read.
          </li>
          <li class={docProse}>
            Foodex looks the product up (in the Open Food Facts database) and
            prefills the ingredient, amount, and unit. It matches the product to
            your ingredient catalog; if nothing matches, a new ingredient is
            created.
          </li>
          <li class={docProse}>
            Adjust anything, optionally add a best-before date and, if your
            household has stores set up, the store and price you paid.
          </li>
          <li class={docProse}>
            <strong>Add to Pantry</strong>. The scanner comes straight back up,
            so you can work through the whole bag: scan, confirm, scan, confirm.
          </li>
        </ol>
        <p class={`${docMuted} mb-0`}>
          Works on any device with a camera. Not every product is in the
          database; for those, confirm the name yourself and it'll still be one
          tap next time.
        </p>
      </DocSection>

      <DocSection id="staples" title="Staples">
        <p class={`${docProse} mb-0`}>
          Nobody weighs their salt. Mark the things you always have (salt, oil,
          water, pepper) as <strong>staples</strong>{" "}
          with the star button. Staples always count as available, are never
          deducted when you cook, and never appear on your shopping list, so
          recipes stop telling you you're missing a pinch of salt.
        </p>
      </DocSection>

      <DocSection id="expiry" title="Best-Before Dates">
        <p class={`${docProse} mb-3`}>
          Set best-before dates on perishables and Foodex turns them into
          decisions instead of guilt:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            The pantry warns you as dates approach.
          </li>
          <li class={docProse}>
            The <strong>Plan</strong>{" "}
            page has a "Use these up" card and ranks recipe suggestions by what
            they'd use up, so the warning comes with a dinner attached.
          </li>
          <li class={docProse}>
            Cooking uses the{" "}
            <strong>oldest stock first</strong>, so the milk closest to its date
            is the one that gets used.
          </li>
          <li class={docProse}>
            You can turn on <strong>expiry notifications</strong>{" "}
            (the bell on the pantry page) to get a push notification before
            things go off. See{" "}
            <a href="/docs/settings" class="link">Settings</a>.
          </li>
        </ul>
      </DocSection>

      <DocSection id="ledger" title="Where Stock Comes From and Goes">
        <p class={`${docProse} mb-3`}>
          Every change to the pantry is recorded with its reason: bought,
          cooked, produced by a recipe, thrown out, or corrected by hand. The
          balance you see is the sum of that history.
        </p>
        <p class={`${docProse} mb-3`}>That design is why undo really works:</p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            Untick a bought item on the shopping list and the pantry takes back
            exactly what that purchase added.
          </li>
          <li class={docProse}>
            Undo a cooked meal and every ingredient returns, including taking
            back whatever the recipe produced.
          </li>
        </ul>
        <DocNote title="Advanced: corrections">
          <p>
            The pantry is a model, and kitchens are not. When reality drifts
            (someone finished the rice without telling Foodex), just edit the
            amount; the correction is recorded like any other movement. A rough
            pantry is still far more useful than none: readiness checks degrade
            gracefully to "probably".
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="merging" title="Merging Duplicates">
        <p class={`${docProse} mb-0`}>
          Two entries for the same thing (one scanned, one typed) can be merged
          into one; their amounts combine, and the merged item keeps the{" "}
          <em>earliest</em>{" "}
          best-before date, since the combined stock is only as good as its
          oldest part. If the duplication is in the ingredient catalog itself
          (two "flour" entries), merge the ingredients instead: see{" "}
          <a href="/docs/ingredients" class="link">Ingredients &amp; prices</a>.
        </p>
      </DocSection>
    </DocsPage>
  );
});
