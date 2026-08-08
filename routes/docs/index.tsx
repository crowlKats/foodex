import { handler, page } from "./$index.ts";
import {
  docMuted,
  DocNote,
  docProse,
  DocSection,
  DocsPage,
} from "../../components/DocsPage.tsx";

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = "Getting Started";
    return { data: {} };
  },
});

export default page(function DocsIndex({ url }) {
  return (
    <DocsPage
      currentPath={url.pathname}
      title="Getting Started"
      intro="What Foodex is, how to sign in, and how to set up your household."
    >
      <DocSection id="what-is-foodex" title="What is Foodex?">
        <p class={`${docProse} mb-3`}>
          Foodex is a kitchen for your recipes. You collect recipes in one
          place, and Foodex keeps track of everything around them: what's in
          your pantry, what you're planning to cook this week, and what you
          still need to buy.
        </p>
        <p class={`${docProse} mb-3`}>
          The three everyday pieces fit together like this:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            Your <strong>pantry</strong> knows what you have.
          </li>
          <li class={docProse}>
            Your <strong>meal plan</strong> knows what you intend to cook.
          </li>
          <li class={docProse}>
            Your <strong>shopping list</strong>{" "}
            is worked out from the difference: everything your plan needs that
            your pantry can't cover.
          </li>
        </ul>
        <p class={`${docProse} mb-0`}>
          You never maintain the shopping list by hand. Plan a meal and the
          missing ingredients appear; buy them and they land in your pantry;
          cook the meal and they're used up. The rest of Foodex (collections,
          dishes, prices, tools) builds on that loop.
        </p>
      </DocSection>

      <DocSection id="signing-in" title="Signing In">
        <p class={`${docProse} mb-3`}>
          You sign in with an account you already have. The sign-in page lists
          the services your Foodex accepts (which sign-in options are offered
          depends on how it's set up). There's no separate Foodex password to
          create or remember: pick a service and sign in there.
        </p>
        <p class={`${docProse} mb-0`}>
          The first time you sign in, Foodex asks one question: what should we
          call you? That name is how the rest of your household sees you. You
          can change it later on your Profile page.
        </p>
      </DocSection>

      <DocSection id="households" title="Your Household">
        <p class={`${docProse} mb-3`}>
          A <strong>household</strong>{" "}
          is your shared space in Foodex: the people you cook with. Your
          recipes, pantry, meal plan, and shopping list all belong to the
          household, so everyone in it sees the same kitchen. You belong to one
          household at a time.
        </p>
        <p class={`${docProse} mb-3`}>
          After signing in for the first time, you'll either:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            <strong>Create a household</strong>: give it a name (like "Smith
            Family" or "Apartment 4B") and you become its owner.
          </li>
          <li class={docProse}>
            <strong>Join a household</strong>: if someone already has one, they
            can send you an invite link or code. Open the link (or paste the
            code on the Get Started page) and you're in.
          </li>
        </ul>
        <p class={`${docMuted} mb-4`}>
          Invite links survive the sign-in detour: if you open one while signed
          out, you'll be brought right back to it after signing in.
        </p>
        <DocNote title="On an invite-only Foodex?">
          <p>
            Some installations of Foodex are invite-only. There, households
            can't be created directly; you join with an invite from a household
            member, or an operator sends you an invite that lets you set up and
            name your own household. If you don't have an invite, ask the person
            who runs your Foodex.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="finding-your-way" title="Finding Your Way Around">
        <p class={`${docProse} mb-3`}>
          The top navigation bar (bottom tabs on a phone) covers the everyday
          areas:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            <strong>Recipes</strong>: browse, search, and cook. See{" "}
            <a href="/docs/recipes" class="link">Browsing &amp; cooking</a>.
          </li>
          <li class={docProse}>
            <strong>Collections</strong>: group recipes however you like. See
            {" "}
            <a href="/docs/organizing" class="link">
              Collections &amp; dishes
            </a>.
          </li>
          <li class={docProse}>
            <strong>Assistant</strong>: chat with an AI that knows your kitchen.
            See{" "}
            <a href="/docs/import" class="link">Import &amp; the assistant</a>.
          </li>
          <li class={docProse}>
            <strong>Pantry</strong>: what you have at home. See{" "}
            <a href="/docs/pantry" class="link">Pantry</a>.
          </li>
          <li class={docProse}>
            <strong>Plan</strong>: what you're going to cook. See{" "}
            <a href="/docs/plan" class="link">Meal plan</a>.
          </li>
          <li class={docProse}>
            <strong>Shopping List</strong>: what to buy, worked out for you. See
            {" "}
            <a href="/docs/shopping" class="link">Shopping list</a>.
          </li>
          <li class={docProse}>
            <strong>Scan</strong>{" "}
            (phone tab): point your camera at a barcode to add groceries to your
            pantry.
          </li>
        </ul>
        <p class={`${docProse} mb-0`}>
          The smaller links (Ingredients, Stores, Tools) are shared reference
          catalogs used across all households; they're covered in{" "}
          <a href="/docs/ingredients" class="link">Ingredients &amp; prices</a>
          {" "}
          and <a href="/docs/household" class="link">Households</a>.
        </p>
      </DocSection>

      <DocSection id="shared-vs-private" title="What's Shared, What's Yours">
        <p class={`${docProse} mb-3`}>
          Foodex is a shared cookbook: recipes are visible across households by
          default, so you can browse and cook what others have added, and they
          can cook yours. A few things control what's shared:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            <strong>Private recipes</strong>{" "}
            are only visible to your household. Use this for secret family
            recipes or works in progress.
          </li>
          <li class={docProse}>
            <strong>Your pantry, plan, and shopping list</strong>{" "}
            are household-only. Other households never see them.
          </li>
          <li class={docProse}>
            <strong>Favorites</strong>{" "}
            are personal: your hearts are yours alone, even within your
            household.
          </li>
          <li class={docProse}>
            <strong>Ingredients, stores, tools, and dishes</strong>{" "}
            are shared catalogs everyone can browse and improve, like a wiki.
          </li>
        </ul>
      </DocSection>

      <DocSection id="next" title="Where to Go Next">
        <p class={`${docProse} mb-3`}>
          If you're new, read the pages in order using the links at the bottom
          of each page. If you want the quick wins first:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            <a href="/docs/import" class="link">Import a recipe</a>{" "}
            from a photo, URL, or pasted text and let the AI do the typing.
          </li>
          <li class={docProse}>
            <a href="/docs/pantry" class="link">Scan your groceries</a>{" "}
            into the pantry as you unpack them.
          </li>
          <li class={docProse}>
            <a href="/docs/plan" class="link">Plan a meal</a>{" "}
            and watch the shopping list write itself.
          </li>
        </ul>
      </DocSection>
    </DocsPage>
  );
});
