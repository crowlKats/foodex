import { handler, page } from "./$household.ts";
import {
  docMuted,
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
      "docs.householdsTitle",
    ).format();
    return { data: {} };
  },
});

export default page(function HouseholdDocs({ url }) {
  const trans = t.use();
  return (
    <DocsPage
      currentPath={url.pathname}
      title={trans("docs.householdsTitle")}
      intro="Members and roles, your household's equipment and stores, and how to move out without losing your recipes."
    >
      <DocSection id="members" title="Members and Roles">
        <p class={`${docProse} mb-3`}>
          Everyone in a household shares the same recipes, pantry, plan, and
          shopping list. There are two roles:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            <strong>Owner</strong>: everything a member can do, plus managing
            members, invites, and settings. Owners can promote members to owner,
            and a household can have several owners.
          </li>
          <li class={docProse}>
            <strong>Member</strong>: full day-to-day use: recipes, pantry, plan,
            shopping.
          </li>
        </ul>

        <DocSub title="Inviting Someone">
          <p class={`${docProse} mb-3`}>
            From the <strong>Household</strong>{" "}
            page, generate an invite and send the link (or code). Opening the
            link walks them through signing in and lands them in your household;
            there's nothing to paste by hand.
          </p>
          <p class={`${docMuted} mb-4`}>
            Invites expire after 7 days; just make a new one if it lapses.
          </p>
        </DocSub>

        <DocSub title="Leaving">
          <p class={`${docProse} mb-4`}>
            You can leave a household at any time, though an owner can only
            leave once someone else owns it. Before leaving, pack your moving
            box (below): recipes belong to the household, not to you, so
            whatever you don't pack stays behind.
          </p>
        </DocSub>

        <DocNote title="Good to know">
          <p>
            You belong to one household at a time, and an account that stays
            without a household is eventually cleaned up (after a week, or 30
            days with a packed moving box). If you're switching households, pack
            first, leave, then join; the box bridges the gap.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="moving-box" title="The Moving Box">
        <p class={`${docProse} mb-3`}>
          Moving out? The <strong>Moving Box</strong>{" "}
          lets you pack the recipes you want to keep. Packed recipes are stored
          as copies, images included, so they survive leaving the household.
          They unpack automatically into the next household you create or join;
          there is no unpack button to forget.
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            Pack individual <strong>recipes</strong> or whole{" "}
            <strong>collections</strong>. Packed collections come back as
            collections, recreated by name with their recipes inside.
          </li>
          <li class={docProse}>
            Packing is safe to repeat: a recipe never gets duplicated by being
            packed twice or via two collections.
          </li>
          <li class={docProse}>
            You can review what's in the box and take things back out any time
            before unpacking.
          </li>
        </ul>
        <DocNote title="Snapshots, not links">
          <p>
            Packed copies are snapshots taken at packing time. If the original
            recipe is edited after you pack, the packed copy doesn't change, so
            pack shortly before you leave.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="tools" title="Your Household's Tools">
        <p class={`${docProse} mb-3`}>
          Tools are a shared catalog of kitchen equipment (blender, stand mixer,
          26cm springform). Your household marks which ones it owns, on the
          Household page, the Tools pages, or right in the recipe editor.
        </p>
        <p class={`${docProse} mb-3`}>Owning tools matters in three places:</p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            Recipes list the tools they need, with settings ("180C convection"),
            and flag any tool your household is missing.
          </li>
          <li class={docProse}>
            The <strong>Ready to make</strong>{" "}
            filter only shows recipes whose tools you own.
          </li>
          <li class={docProse}>
            A tool's page lists every recipe that uses it, handy for "what can I
            do with this thing" (or before deciding a gadget can go).
          </li>
        </ul>
      </DocSection>

      <DocSection id="stores" title="Your Household's Stores">
        <p class={`${docProse} mb-3`}>
          Stores are the shops you buy from ("Tesco", "Local Farmer's Market"),
          each with a currency and, for chains, multiple locations. Like tools,
          stores are a shared catalog; mark the ones your household actually
          uses.
        </p>
        <p class={`${docProse} mb-3`}>Stores power the money features:</p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            Ingredient prices are recorded per store, which drives recipe cost
            estimates.
          </li>
          <li class={docProse}>
            The shopping list can group by store and shows per-store totals.
          </li>
          <li class={docProse}>
            Foodex remembers which store your household buys each ingredient
            from, and suggests the cheapest known store otherwise.
          </li>
        </ul>
        <p class={`${docMuted} mt-2 mb-0`}>
          Details on recording prices are in{" "}
          <a href="/docs/ingredients" class="link">Ingredients &amp; prices</a>.
        </p>
      </DocSection>
    </DocsPage>
  );
});
