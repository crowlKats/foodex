import { handler, page } from "./$writing-recipes.ts";
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
    ctx.state.pageTitle = "Writing Recipes";
    return { data: {} };
  },
});

export default page(function WritingRecipesDocs({ url }) {
  return (
    <DocsPage
      currentPath={url.pathname}
      title="Writing Recipes"
      intro="The recipe editor from front to back: the basics, ingredients and their keys, steps and sections, and the advanced options."
    >
      <DocSection id="editor" title="The Recipe Editor">
        <p class={`${docProse} mb-3`}>
          Click <strong>New Recipe</strong> and then{" "}
          <strong>Fill in the form yourself</strong> to start from scratch, or
          {" "}
          <strong>Edit</strong>{" "}
          on any of your household's recipes. It's the same editor either way
          (imports and the assistant use it too), organized into four tabs:{" "}
          <strong>Basics</strong>, <strong>Ingredients</strong>,{" "}
          <strong>Steps</strong>, and <strong>Advanced</strong>.
        </p>
        <p class={`${docMuted} mb-4`}>
          Don't feel obliged to fill everything in. A title, a few ingredients,
          and a couple of steps make a perfectly good recipe; the rest can come
          later.
        </p>
        <p class={`${docProse} mb-0`}>
          <strong>Preview</strong>{" "}
          shows the recipe as readers will see it, and on the edit page an{" "}
          <strong>Ask AI</strong>{" "}
          button hands the recipe to the assistant with a request like "make
          this vegetarian" or "halve the sugar". See{" "}
          <a href="/docs/import" class="link">Import &amp; the assistant</a>.
        </p>
      </DocSection>

      <DocSection id="basics" title="Basics">
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            <strong>Title</strong> (required) and <strong>description</strong>.
          </li>
          <li class={docProse}>
            <strong>Dish</strong>: which dish this recipe makes. It's matched
            from the title automatically; you only touch this to pin the recipe
            to a different dish. See{" "}
            <a href="/docs/organizing" class="link">
              Collections &amp; dishes
            </a>.
          </li>
          <li class={docProse}>
            <strong>Yield &amp; timing</strong>: how the recipe is measured
            (servings, total weight, volume, or tray dimensions) plus prep,
            cook, and rest times. The yield type decides how readers scale it.
          </li>
          <li class={docProse}>
            <strong>Classification</strong>: difficulty, meal types, dietary
            tags.
          </li>
          <li class={docProse}>
            <strong>Source</strong>: where it came from, like a book title, a
            website, or "Grandma", with an optional link.
          </li>
        </ul>
      </DocSection>

      <DocSection id="ingredients" title="Ingredients">
        <p class={`${docProse} mb-3`}>
          Each ingredient row has a searchable picker, an amount and unit, an
          optional note ("finely chopped, room temperature"), and a{" "}
          <strong>key</strong>.
        </p>

        <DocSub title="The Ingredient Picker">
          <p class={`${docProse} mb-4`}>
            Ingredients link to the shared catalog, which is what powers pantry
            matching, prices, and unit conversion. Search and pick the right
            entry when you can. Typing a name that isn't in the catalog works
            too; a matching catalog entry is found or created when the recipe is
            saved.
          </p>
        </DocSub>

        <DocSub title="Keys and Scaled Amounts in Steps">
          <p class={`${docProse} mb-3`}>
            The key is how you refer to the ingredient inside step text. Write
            {" "}
            <code class="code-hint">{"{{ flour }}"}</code>{" "}
            in a step and readers see "200g flour", automatically rescaled
            whenever they change the servings. Keys are generated from the name;
            edit one if you have, say, two kinds of flour.
          </p>
          <p class={`${docMuted} mb-4`}>
            This is the single most useful habit when writing recipes: never
            hard-code an amount into a step. The full syntax (arithmetic,
            name-only references, and more) is in the{" "}
            <a href="/docs/templates" class="link">template reference</a>.
          </p>
        </DocSub>

        <DocSub title="Made While Cooking">
          <p class={`${docProse} mb-4`}>
            Some "ingredients" aren't bought, they happen along the way: browned
            butter, a reserved pasta liquid. Tick{" "}
            <strong>made while cooking</strong>{" "}
            on such a row. It scales and can be referenced in steps like any
            other ingredient, but it's never shopped for, never counted as
            missing, and shows up under "Made while cooking" on the recipe page.
          </p>
        </DocSub>

        <DocNote title="Staples">
          <p>
            Water, salt, and other always-there items are marked as staples on
            the ingredient itself (in the shared catalog), not per recipe.
            Staple ingredients scale with the recipe but are never bought or
            counted as missing, for anyone.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="steps" title="Steps">
        <p class={`${docProse} mb-3`}>
          Each step has an optional title, a body, and photos. Bodies are
          Markdown with a few Foodex extras:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-4">
          <li class={docProse}>
            <code class="code-hint">{"{{ key }}"}</code>{" "}
            for scaled ingredient amounts (see above).
          </li>
          <li class={docProse}>
            <code class="code-hint">@timer(15m)</code>{" "}
            for a tap-to-start countdown, or{" "}
            <code class="code-hint">@timer(4-6m)</code> for a range.
          </li>
          <li class={docProse}>
            <code class="code-hint">@step(3)</code> to link another step,{" "}
            <code class="code-hint">@recipe(slug)</code>{" "}
            to link a specific recipe, and{" "}
            <code class="code-hint">@dish(slug)</code>{" "}
            to link a dish when any version will do.
          </li>
          <li class={docProse}>
            <code class="code-hint">@tool(name)</code>{" "}
            to reference an attached tool with its settings, or{" "}
            <code class="code-hint">@tool(name, settings)</code>{" "}
            when one use needs its own ("speed 2" now, "high speed" later).
          </li>
        </ul>
        <p class={`${docMuted} mb-4`}>
          The editor highlights this syntax as you type and flags mistakes
          before you save. The complete list lives in the{" "}
          <a href="/docs/templates" class="link">template reference</a>.
        </p>

        <DocSub title="Sections">
          <p class={`${docProse} mb-4`}>
            Longer recipes read better in sections ("Dough", "Filling",
            "Assembly"). Use{" "}
            <strong>Group steps into sections</strong>: each section gets a
            title and a key, step numbering restarts inside each one, and{" "}
            <code class="code-hint">@step(filling.2)</code>{" "}
            points at a step inside a section.
          </p>
        </DocSub>

        <DocNote title="Advanced: the graph editor and parallel steps">
          <p>
            By default steps run as a simple chain. Switch the Steps tab to{" "}
            <strong>graph view</strong>{" "}
            and you can wire them as a dependency graph instead: put the sauce
            and the pasta in parallel branches, and make "Assembly" wait on
            both. Add steps or whole sections in sequence or as parallel
            branches, and drag between cards to add a dependency.
          </p>
          <p>
            The payoff is in cooking mode: parallel branches are shown side by
            side as separate columns, so the recipe itself tells two cooks how
            to split the work. Recipes without explicit dependencies simply read
            top to bottom.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="advanced-tab" title="The Advanced Tab">
        <DocSub title="Cover Image">
          <p class={`${docProse} mb-4`}>
            Upload a photo of the finished dish; you can crop it before saving.
            It appears on the recipe page and in lists.
          </p>
        </DocSub>

        <DocSub title="Tools">
          <p class={`${docProse} mb-4`}>
            Attach the kitchen tools the recipe needs, each with optional
            default settings ("180C convection"). Tools come from the shared
            catalog; creating one here also adds it to your household's
            equipment. Readers whose household lacks a tool see a "not owned"
            flag, and the "Ready to make" filter takes tools into account.
          </p>
        </DocSub>

        <DocSub title="Output Ingredient">
          <p class={`${docProse} mb-3`}>
            If the recipe <em>produces</em>{" "}
            an ingredient (pizza dough, lemon curd, chicken stock), say so: pick
            the ingredient, the yield amount, and a shelf life.
          </p>
          <p class={`${docProse} mb-4`}>
            Now cooking the recipe doesn't just take ingredients out of the
            pantry, it puts the product in, with the right best-before date.
            Other recipes that use that ingredient will then see it as in stock.
            This is how chains like "make stock on Sunday, use it in risotto on
            Tuesday" work end to end.
          </p>
        </DocSub>

        <DocSub title="Sub-recipe References">
          <p class={`${docProse} mb-4`}>
            Link the recipes this one builds on. They're listed on the recipe
            page, and <code class="code-hint">@recipe()</code>{" "}
            references in steps become links.
          </p>
        </DocSub>

        <DocSub title="Visibility">
          <p class={`${docProse} mb-0`}>
            Tick <strong>Private</strong>{" "}
            to keep the recipe visible to your household only.
          </p>
        </DocSub>
      </DocSection>
    </DocsPage>
  );
});
