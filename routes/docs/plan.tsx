import { handler, page } from "./$plan.ts";
import {
  docMuted,
  DocNote,
  docProse,
  DocSection,
  DocsPage,
} from "../../components/DocsPage.tsx";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import en from "../../components/DocsPage.en.mfr";
import it from "../../components/DocsPage.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "docs.planTitle",
    ).format();
    return { data: {} };
  },
});

export default page(function PlanDocs({ url }) {
  const trans = t.use();
  return (
    <DocsPage
      currentPath={url.pathname}
      title={trans("docs.planTitle")}
      intro="The record of what you intend to cook. It drives the shopping list, and cooking from it keeps the pantry honest."
    >
      <DocSection id="role" title="What the Plan Is For">
        <p class={`${docProse} mb-3`}>
          The plan ties the whole kitchen together. Planning a meal is what puts
          its missing ingredients on the shopping list, and marking it cooked is
          what moves stock out of the pantry. If you use one page daily, it's
          this one.
        </p>
        <DocNote title="The plan remembers scale, not amounts">
          <p>
            A planned meal stores which recipe and at what scale, not a frozen
            ingredient list. Change your mind and cook for eight instead of
            four: bump the batch number and the shopping list, readiness checks,
            and eventual pantry deduction all follow. Nothing downstream goes
            stale.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="planning" title="Planning a Meal">
        <p class={`${docProse} mb-3`}>
          On any recipe, set the servings you actually want and hit{" "}
          <strong>Plan this</strong>{" "}
          (optionally picking a day). The meal appears on the Plan page, where
          each entry shows:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            A readiness line: "Everything's in the pantry", or exactly what's
            missing at that scale.
          </li>
          <li class={docProse}>
            The <strong>batch</strong>{" "}
            multiplier, editable in place. Doubling it doubles the demand.
          </li>
          <li class={docProse}>
            A <strong>date</strong>, if you plan by day.
          </li>
          <li class={docProse}>
            An <strong>On the shopping list</strong>{" "}
            checkbox, so you can plan something without letting it add to the
            list yet (say, for next week's shop).
          </li>
        </ul>
      </DocSection>

      <DocSection id="dishes" title="Planning a Dish (Recipe to Be Decided)">
        <p class={`${docProse} mb-3`}>
          Sometimes you know Thursday is lasagna night but not <em>whose</em>
          {" "}
          lasagna. From a dish page, <strong>Plan this dish</strong>{" "}
          with a serving count adds an entry with no recipe pinned yet.
        </p>
        <p class={`${docProse} mb-3`}>
          A dish entry contributes nothing to the shopping list until you pick a
          version: the entry offers the candidate recipes, each labeled "ready
          to cook" or with what it's missing, and <strong>Choose</strong>{" "}
          pins one. From then on it behaves like a normal planned meal, scaled
          to hit your serving count.
        </p>
        <p class={`${docMuted} mb-0`}>
          Dishes and how recipes group under them are covered in{" "}
          <a href="/docs/organizing" class="link">Collections &amp; dishes</a>.
        </p>
      </DocSection>

      <DocSection id="cooking" title="Cooking and Undoing">
        <p class={`${docProse} mb-3`}>
          When a meal is made, hit <strong>Cooked it</strong>{" "}
          (or finish it in cooking mode). Foodex then:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            Takes the ingredients out of the pantry, oldest stock first.
          </li>
          <li class={docProse}>
            Tells you if the pantry came up short rather than quietly pretending
            it had enough.
          </li>
          <li class={docProse}>
            Adds whatever the recipe <em>produces</em>{" "}
            back in, when it has an output ingredient (a stock, a dough), with
            its shelf life.
          </li>
          <li class={docProse}>
            Records it in your cooking history.
          </li>
        </ul>
        <p class={`${docProse} mb-0`}>
          The <strong>Recently cooked</strong> list keeps the last cooks with an
          {" "}
          <strong>Undo</strong>{" "}
          button: one click puts every ingredient back exactly as it was,
          including removing anything the recipe produced. Mis-taps are free.
        </p>
      </DocSection>

      <DocSection id="suggestions" title="What to Cook Next">
        <p class={`${docProse} mb-3`}>
          The Plan page's sidebar helps you decide:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            <strong>Use these up</strong>: pantry items expiring in the next few
            days.
          </li>
          <li class={docProse}>
            <strong>Cook next</strong>: recipe suggestions ranked by what they'd
            use up before it goes off, each showing whether you have everything,
            with a one-click <strong>Plan</strong> button.
          </li>
        </ul>
      </DocSection>
    </DocsPage>
  );
});
