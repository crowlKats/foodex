import { handler, page } from "./$organizing.ts";
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
    ctx.state.pageTitle = "Collections & Dishes";
    return { data: {} };
  },
});

export default page(function OrganizingDocs({ url }) {
  return (
    <DocsPage
      currentPath={url.pathname}
      title="Collections & Dishes"
      intro="Two ways to bring recipes together: collections you curate yourself, and dishes that group every version of the same thing."
    >
      <DocSection id="collections" title="Collections">
        <p class={`${docProse} mb-4`}>
          Collections group recipes however you like: a weeknight set, a
          Christmas menu, everything you've cooked out of one book. A collection
          belongs to your household, and it can be shared with other households
          by link.
        </p>

        <DocSub title="Creating a Collection">
          <p class={`${docProse} mb-3`}>
            Go to <strong>Collections</strong> and click{" "}
            <strong>New Collection</strong>. You can set:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-3">
            <li class={docProse}>
              A <strong>cover image</strong> (optional).
            </li>
            <li class={docProse}>
              A <strong>name</strong> and <strong>description</strong>.
            </li>
            <li class={docProse}>
              Whether it's{" "}
              <strong>private</strong>: visible only to household members and
              households you've shared it with.
            </li>
            <li class={docProse}>
              The <strong>recipes</strong>{" "}
              it contains, picked from every recipe you can see. You can reorder
              them later when editing.
            </li>
          </ul>
        </DocSub>

        <DocSub title="Adding Recipes as You Browse">
          <p class={`${docProse} mb-4`}>
            Once your household has at least one collection, every recipe page
            gets a <strong>Collect</strong>{" "}
            button. It opens a searchable list of your collections; click one to
            add or remove the recipe on the spot. A green check shows which
            collections already contain it.
          </p>
        </DocSub>

        <DocSub title="Sharing a Collection">
          <p class={`${docProse} mb-3`}>
            On a collection you own, click <strong>Share</strong>{" "}
            to get a share link. Anyone who opens it sees the collection's name
            and description, and can add it to their own Collections page once
            they're signed in with a household. The link expires after 30 days.
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-3">
            <li class={docProse}>
              Shared collections show up on the recipient's Collections page
              with a <strong>shared</strong>{" "}
              badge. They're read-only for recipients; only your household can
              edit.
            </li>
            <li class={docProse}>
              The <strong>Shared with</strong>{" "}
              list on the collection page shows which households have access;
              you can remove any of them at any time.
            </li>
            <li class={docProse}>
              <strong>Unshare</strong>{" "}
              revokes the link itself. Households that already added the
              collection keep access until you remove them individually.
            </li>
            <li class={docProse}>
              A recipient can leave a shared collection with{" "}
              <strong>Leave Collection</strong>.
            </li>
          </ul>
          <p class={`${docMuted} mb-4`}>
            Recipes that are private to your household stay hidden from viewers
            who can't see them, even inside a shared collection.
          </p>
        </DocSub>

        <DocSub title="Deleting">
          <p class={`${docProse} mb-0`}>
            Deleting a collection removes the grouping only. The recipes in it
            are untouched.
          </p>
        </DocSub>
      </DocSection>

      <DocSection id="dishes" title="Dishes">
        <p class={`${docProse} mb-4`}>
          A <strong>dish</strong> is the thing you cook; a{" "}
          <strong>recipe</strong>{" "}
          is one particular way of cooking it. "Lasagna" is a dish; your
          household's lasagna and your neighbor's lasagna are two recipes that
          make it. Dishes are shared across all households, so a dish page
          collects every version in one place.
        </p>

        <DocSub title="The Dish Page">
          <p class={`${docProse} mb-3`}>
            Each recipe links to its dish. The dish page shows:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={docProse}>
              Every recipe that makes the dish, with your household's versions
              listed first and marked{" "}
              <strong>yours</strong>. Private recipes from other households stay
              hidden.
            </li>
            <li class={docProse}>
              Any alternate names the dish goes by ("Also known as").
            </li>
            <li class={docProse}>
              A <strong>Compare versions</strong>{" "}
              table when there's more than one visible recipe (see below).
            </li>
            <li class={docProse}>
              A <strong>Plan this dish</strong>{" "}
              button: pick a serving count and add the dish to your meal plan
              without choosing a specific recipe yet. You pick the version when
              it's time to cook. See{" "}
              <a href="/docs/plan" class="link">Meal plan</a>.
            </li>
          </ul>
        </DocSub>

        <DocSub title="Comparing Versions">
          <p class={`${docProse} mb-3`}>
            The comparison table puts the versions side by side, one column per
            recipe, one row per ingredient. A dash means that version doesn't
            use the ingredient; a check means it's listed without an amount.
          </p>
          <p class={`${docProse} mb-4`}>
            Since different recipes make different batch sizes, turn on{" "}
            <strong>Normalize to N servings</strong>{" "}
            to rescale every column to the same serving count before comparing
            amounts. Recipes measured by weight, volume, or tray size can't be
            rescaled that way and stay "as written".
          </p>
        </DocSub>

        <DocSub title="How Recipes Land in a Dish">
          <p class={`${docProse} mb-3`}>
            You normally don't do anything: a recipe is matched to its dish from
            its title automatically, and the dish is created the first time
            anyone names a recipe after it. If the automatic match is wrong, the
            recipe edit form has a dish picker where you can:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-3">
            <li class={docProse}>
              <strong>Pin</strong>{" "}
              the recipe to a dish you choose. Pinned recipes stay put even if
              you rename them; unpin to go back to automatic matching.
            </li>
            <li class={docProse}>
              <strong>Create a new dish</strong>{" "}
              by typing a name no dish has yet. The recipe is pinned to it, and
              recipes with a matching title move along with it.
            </li>
          </ul>
        </DocSub>

        <DocNote title="Advanced: Merging Dishes">
          <p>
            The same dish sometimes ends up under two names ("Spag Bol" and
            "Spaghetti Bolognese"). The dish page suggests lookalike dishes and
            offers a <strong>Merge</strong>{" "}
            control: merging moves every recipe from one dish into the other,
            across all households, and keeps the old name as an alias so future
            recipes with that title land on the merged dish too.
          </p>
          <p>
            Merging cannot be undone with a button, so read the confirmation
            carefully. If a recipe was swept into the wrong dish, the way out is
            the dish picker on that recipe's edit form: create the dish fresh
            under its own name, which pulls matching recipes back out.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="tags-and-favorites" title="Tags, Favorites, and Search">
        <p class={`${docProse} mb-3`}>
          Collections and dishes work alongside the lighter-weight ways of
          finding things:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            <strong>Tags</strong>{" "}
            classify a recipe by meal type (breakfast, lunch, dinner, and so on)
            and dietary labels (vegetarian, vegan, gluten-free, and more). The
            recipe list can filter by any of them.
          </li>
          <li class={docProse}>
            <strong>Favorites</strong>{" "}
            are your personal bookmarks: click the heart on any recipe, and
            filter the list to favorites only.
          </li>
          <li class={docProse}>
            <strong>Search</strong>{" "}
            covers titles, ingredients, and step text. See{" "}
            <a href="/docs/recipes" class="link">Browsing &amp; cooking</a>.
          </li>
        </ul>
      </DocSection>
    </DocsPage>
  );
});
