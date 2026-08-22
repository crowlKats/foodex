import { handler, page } from "./$recipes.ts";
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
    ctx.state.pageTitle = catalogFor(ctx.state.locale).docs.recipesTitle();
    return { data: {} };
  },
});

export default page(function RecipesDocs({ url }) {
  const m = useMessages();
  return (
    <DocsPage
      currentPath={url.pathname}
      title={m.docs.recipesTitle()}
      intro="Finding recipes, reading them at the right scale, and cooking with timers and step-by-step mode."
    >
      <DocSection id="browsing" title="Browsing and Searching">
        <p class={`${docProse} mb-3`}>
          The <strong>Recipes</strong>{" "}
          page lists every recipe you can see: your household's own, plus
          everything other households have shared. Each card shows the cover
          photo, difficulty, times, and tags.
        </p>
        <p class={`${docProse} mb-3`}>
          The controls at the top narrow the list down:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            <strong>Search</strong>{" "}
            looks through titles, ingredients, and step text.
          </li>
          <li class={docProse}>
            <strong>Difficulty</strong>: Easy, Medium, or Hard.
          </li>
          <li class={docProse}>
            <strong>Meal type</strong> and <strong>dietary</strong>{" "}
            tags: breakfast to dessert, vegetarian to keto. You can pick several
            at once.
          </li>
          <li class={docProse}>
            <strong>Favorites only</strong>: just the recipes you've hearted.
          </li>
          <li class={docProse}>
            <strong>Ready to make</strong>: only recipes your pantry and tools
            can actually cover right now.
          </li>
        </ul>
        <DocNote title='How "Ready to make" decides'>
          <p>
            It checks amounts, not just names: a spoonful of flour doesn't count
            as having flour for a bread recipe. Staples (salt, water, things
            you've marked as always on hand) always count, and recipes needing a
            tool your household doesn't own are excluded. It's the fastest
            answer to "what can I cook right now?"
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="reading" title="Reading a Recipe">
        <p class={`${docProse} mb-3`}>A recipe page shows:</p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            The <strong>cover photo</strong> (click to enlarge), a{" "}
            <strong>description</strong>, and the details: prep, cook, and rest
            times, difficulty, tags, and the source it came from.
          </li>
          <li class={docProse}>
            The <strong>ingredient list</strong>{" "}
            with exact amounts at the current scale, pantry indicators, and
            costs when prices are known.
          </li>
          <li class={docProse}>
            Numbered{" "}
            <strong>steps</strong>, possibly with photos, embedded timers, and
            links to other steps or recipes.
          </li>
          <li class={docProse}>
            <strong>Tools</strong>{" "}
            the recipe needs, with their settings ("Oven (180C)"). A tool your
            household doesn't own is flagged "not owned".
          </li>
          <li class={docProse}>
            <strong>Sub-recipes</strong>{" "}
            it builds on, like a dough or a sauce, linked so you can jump over.
          </li>
        </ul>

        <DocSub title="Pantry Indicators">
          <p class={`${docProse} mb-3`}>
            If your household keeps a pantry, the recipe tells you where you
            stand at a glance: a banner reads either "You have everything for
            this" or how many ingredients you're missing. Each ingredient line
            carries a dot:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={docProse}>
              <strong>Green</strong>: your pantry covers it at the current
              scale.
            </li>
            <li class={docProse}>
              <strong>Amber</strong>: you have some, but not enough. The tooltip
              says how short you are.
            </li>
            <li class={docProse}>
              <strong>Hollow circle</strong>: a staple that's always on hand. It
              scales with the recipe but never goes on a shopping list.
            </li>
          </ul>
          <p class={`${docMuted} mb-4`}>
            Change the scale and the dots react: doubling a recipe can turn a
            green dot amber.
          </p>
        </DocSub>

        <DocSub title="Substitutions">
          <p class={`${docProse} mb-4`}>
            Out of something? Each ingredient line has a substitutions button
            that asks the AI for sensible swaps, with the ratio to use and a
            note on what changes.
          </p>
        </DocSub>

        <DocSub title="Cost Estimates">
          <p class={`${docProse} mb-0`}>
            When ingredient prices have been recorded, each line shows its cost
            and the recipe shows an estimated total, both scaled along with the
            servings. See{" "}
            <a href="/docs/ingredients" class="link">
              Ingredients &amp; prices
            </a>{" "}
            for how prices get in.
          </p>
        </DocSub>
      </DocSection>

      <DocSection id="scaling" title="Scaling">
        <p class={`${docProse} mb-3`}>
          Every recipe has a quantity control matched to how it's measured:
          servings for most dishes, total weight for things like dough, volume
          for liquids, or tray dimensions for bakes. Change the number and every
          ingredient amount updates instantly, including amounts written inside
          the step text.
        </p>
        <p class={`${docProse} mb-3`}>
          Amounts are shown in your preferred unit system (metric or imperial;
          set it on your Profile page).
        </p>
        <DocNote title="Scale by ingredient">
          <p>
            Sometimes the constraint isn't how many people you're feeding but
            what's in the bag: you have exactly 350g of flour. Use{" "}
            <strong>Scale by ingredient</strong>, pick the flour, type 350, and
            the whole recipe rescales so the flour comes out to exactly that.
          </p>
        </DocNote>
        <DocNote title="How tray scaling works">
          <p>
            Recipes measured by tray dimensions scale by area (or volume, with a
            depth), not by side length. If you switch from a 20cm square tin to
            a 30cm one, that's 2.25 times the batter, and Foodex does that math
            for you.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="timers" title="Timers">
        <p class={`${docProse} mb-3`}>
          Steps can embed tap-to-start timers ("bake for 15 minutes" with a
          button right there). Running timers float at the bottom corner of the
          screen with a countdown, and you can pause or dismiss them. Several
          can run at once. When a timer finishes it beeps until dismissed and,
          if you've allowed notifications, sends one so you hear it from the
          couch.
        </p>
        <p class={`${docMuted} mb-0`}>
          Range timers ("4 to 6 minutes") ring at the lower bound and offer a
          one-tap extension to the upper bound, so you can check and decide.
        </p>
      </DocSection>

      <DocSection id="cooking-mode" title="Cooking Mode">
        <p class={`${docProse} mb-3`}>
          <strong>Start Cooking</strong>{" "}
          opens a full-screen, step-at-a-time view designed for a propped-up
          phone or tablet. The screen stays awake while you cook.
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            Move through steps with the buttons, arrow keys, or a swipe. A
            progress header shows where you are; tap a dot to jump.
          </li>
          <li class={docProse}>
            A collapsible panel keeps the full scaled ingredient list in reach.
          </li>
          <li class={docProse}>
            Links between steps ("see step 5") jump within cooking mode and
            offer a way back.
          </li>
          <li class={docProse}>
            The final step ends with{" "}
            <strong>Done: I cooked this</strong>, which takes the ingredients
            out of your pantry.
          </li>
        </ul>
        <DocNote title="Advanced: parallel steps">
          <p>
            Recipes can be written so that independent parts (say, the sauce and
            the pasta) run side by side. In cooking mode each active branch gets
            its own column, so two cooks can work the same recipe at once, and
            sections light up as they unlock and complete. How to write such a
            recipe is covered in{" "}
            <a href="/docs/writing-recipes" class="link">Writing recipes</a>.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="acting" title="Planning, Cooking, and Sharing">
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            <strong>Plan this</strong>{" "}
            puts the recipe on your meal plan at the current scale, optionally
            for a specific day. Whatever your pantry can't cover appears on the
            shopping list. See <a href="/docs/plan" class="link">Meal plan</a>.
          </li>
          <li class={docProse}>
            <strong>Add missing to shopping list</strong>{" "}
            does the same from the ingredient list.
          </li>
          <li class={docProse}>
            The <strong>+</strong>{" "}
            button on a single ingredient line adds just that item, and only the
            amount your pantry doesn't already cover.
          </li>
          <li class={docProse}>
            <strong>I cooked this</strong>{" "}
            records a cook on the spot: ingredients come out of the pantry
            (oldest stock first), and if the recipe produces something (a dough,
            a stock), that goes in. If the pantry came up short, Foodex says so
            instead of quietly pretending.
          </li>
          <li class={docProse}>
            <strong>Share</strong>{" "}
            opens your device's share sheet, or copies the link.
          </li>
          <li class={docProse}>
            <strong>Print</strong>{" "}
            gives you a clean printout without the app around it.
          </li>
          <li class={docProse}>
            <strong>Collect</strong>{" "}
            files the recipe into one of your collections. See{" "}
            <a href="/docs/organizing" class="link">
              Collections &amp; dishes
            </a>.
          </li>
        </ul>
      </DocSection>

      <DocSection id="favorites-forks" title="Favorites, Forks, and Privacy">
        <DocSub title="Favorites">
          <p class={`${docProse} mb-4`}>
            The heart on a recipe bookmarks it for you personally; each
            household member has their own favorites. Filter the recipe list to
            favorites to get back to them quickly.
          </p>
        </DocSub>
        <DocSub title="Forking">
          <p class={`${docProse} mb-4`}>
            <strong>Fork</strong>{" "}
            creates your own copy of any recipe you can see, linked back to the
            original so you can always compare. It's the polite way to make your
            spicy version of someone else's pasta sauce: their recipe stays
            theirs, yours is yours.
          </p>
        </DocSub>
        <DocSub title="Private Recipes">
          <p class={`${docProse} mb-0`}>
            Recipes are shared across households by default. Mark a recipe{" "}
            <strong>private</strong>{" "}
            (on the edit form's Advanced tab) and only your household sees it,
            everywhere: lists, search, dish pages, and shared collections all
            respect it.
          </p>
        </DocSub>
      </DocSection>
    </DocsPage>
  );
});
