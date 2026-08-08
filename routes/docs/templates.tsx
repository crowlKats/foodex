import { handler, page } from "./$templates.ts";
import { docProse, DocSection, DocsPage } from "../../components/DocsPage.tsx";

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = "Template Syntax";
    return { data: {} };
  },
});

export default page(function TemplateDocs({ url }) {
  return (
    <DocsPage
      currentPath={url.pathname}
      title="Template Syntax"
      intro="The complete reference for recipe step bodies: scaled ingredient references, math, timers, and links to steps, recipes, dishes, and tools."
    >
      <DocSection id="ingredient-references" title="Ingredient References">
        <p class={`${docProse} mb-3`}>
          Each ingredient has a <strong>key</strong>{" "}
          (set when adding ingredients). Use the key inside{" "}
          <code class="code-hint">{"{{ }}"}</code> to reference it.
        </p>
        <div class="card space-y-3">
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Full output (amount + unit + name, lowercase)
            </div>
            <code class="code-hint">{"{{ flour }}"}</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>200g flour</span>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Capitalized (for start of sentence)
            </div>
            <code class="code-hint">{"{{ Flour }}"}</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>200g Flour</span>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Name only (no amount, for "add the flour")
            </div>
            <code class="code-hint">{"{{ flour.name }}"}</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>flour</span>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Amount only (number, for math)
            </div>
            <code class="code-hint">{"{{ flour.amount }}"}</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>200</span>
          </div>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          All values scale automatically when the recipe quantity changes.
        </p>
      </DocSection>

      <DocSection id="arithmetic" title="Arithmetic">
        <p class={`${docProse} mb-3`}>
          You can do math inside <code class="code-hint">{"{{ }}"}</code>{" "}
          expressions.
        </p>
        <div class="card overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-stone-200 dark:border-stone-700">
                <th class="text-left py-2 pr-4">Expression</th>
                <th class="text-left py-2 pr-4">Result</th>
                <th class="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">
                  <code>{"{{ flour.amount / 2 }}"}</code>
                </td>
                <td class="py-2 pr-4">100</td>
                <td class="py-2 font-sans">Half the flour</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">
                  <code>{"{{ flour.amount * 1.5 }}"}</code>
                </td>
                <td class="py-2 pr-4">300</td>
                <td class="py-2 font-sans">1.5x the flour</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">
                  <code>{"{{ flour.amount + 50 }}"}</code>
                </td>
                <td class="py-2 pr-4">250</td>
                <td class="py-2 font-sans">Add 50 to flour</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">
                  <code>{"{{ (flour.amount + sugar.amount) / 2 }}"}</code>
                </td>
                <td class="py-2 pr-4">175</td>
                <td class="py-2 font-sans">Average of two</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          Supported operators: <code class="code-hint">+</code>{" "}
          <code class="code-hint">-</code> <code class="code-hint">*</code>{" "}
          <code class="code-hint">/</code> and parentheses{" "}
          <code class="code-hint">( )</code> for grouping.
        </p>
      </DocSection>

      <DocSection id="functions" title="Functions">
        <div class="card overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-stone-200 dark:border-stone-700">
                <th class="text-left py-2 pr-4">Function</th>
                <th class="text-left py-2 pr-4">Example</th>
                <th class="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody class="font-mono">
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">round()</td>
                <td class="py-2 pr-4">
                  <code>{"{{ round(flour.amount / 3) }}"}</code>
                </td>
                <td class="py-2 font-sans">Round to nearest integer</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">ceil()</td>
                <td class="py-2 pr-4">
                  <code>{"{{ ceil(eggs.amount) }}"}</code>
                </td>
                <td class="py-2 font-sans">Round up</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">floor()</td>
                <td class="py-2 pr-4">
                  <code>{"{{ floor(eggs.amount) }}"}</code>
                </td>
                <td class="py-2 font-sans">Round down</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">min()</td>
                <td class="py-2 pr-4">
                  <code>{"{{ min(flour.amount, 500) }}"}</code>
                </td>
                <td class="py-2 font-sans">Smaller of two values</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4">max()</td>
                <td class="py-2 pr-4">
                  <code>{"{{ max(flour.amount, 100) }}"}</code>
                </td>
                <td class="py-2 font-sans">Larger of two values</td>
              </tr>
              <tr>
                <td class="py-2 pr-4">abs()</td>
                <td class="py-2 pr-4">
                  <code>{"{{ abs(a.amount - b.amount) }}"}</code>
                </td>
                <td class="py-2 font-sans">Absolute value</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection id="step-references" title="Step References">
        <p class={`${docProse} mb-3`}>
          Reference another step using <code class="code-hint">@step(N)</code>
          {" "}
          where N is the step number.
        </p>
        <div class="card space-y-3">
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Global reference
            </div>
            <code class="code-hint">@step(2)</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>step 2 (Mix dry ingredients)</span>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Section-relative reference (when the recipe has sections)
            </div>
            <code class="code-hint">@step(coating.2)</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>Coating step 2 (Dip and roll)</span>
          </div>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          If the recipe has sections, step numbers restart at 1 in each section.
          Use <code class="code-hint">@step(section-key.N)</code>{" "}
          to point at the Nth step inside a section, or plain{" "}
          <code class="code-hint">@step(N)</code>{" "}
          to count globally across the whole recipe.
        </p>
      </DocSection>

      <DocSection id="recipe-references" title="Sub-recipe References">
        <p class={`${docProse} mb-3`}>
          Link to other recipes inline using the{" "}
          <code class="code-hint">@recipe()</code> syntax.
        </p>
        <div class="card space-y-3">
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Syntax
            </div>
            <code class="code-hint">@recipe(pizza-dough)</code>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Renders as
            </div>
            <a href="#" class="link">Pizza Dough</a>
            <span class="text-stone-500 text-sm ml-2">
              (linked to the recipe)
            </span>
          </div>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          Use the recipe's slug (the URL-friendly name shown in the address
          bar).
        </p>
      </DocSection>

      <DocSection id="dish-references" title="Dish References">
        <p class={`${docProse} mb-3`}>
          When any version of a dish will do ("use pizza dough", not one
          specific dough recipe), link the dish itself with the{" "}
          <code class="code-hint">@dish()</code> syntax.
        </p>
        <div class="card space-y-3">
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Syntax
            </div>
            <code class="code-hint">@dish(pizza-dough)</code>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Renders as
            </div>
            <a href="#" class="link">Pizza Dough</a>
            <span class="text-stone-500 text-sm ml-2">
              (linked to the dish page listing every recipe that makes it)
            </span>
          </div>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          Use the dish's slug from its page's address ({"/dishes/…"}). Prefer
          this over <code class="code-hint">@recipe()</code>{" "}
          when the reader should pick whichever version they like.
        </p>
      </DocSection>

      <DocSection id="tool-references" title="Tool References">
        <p class={`${docProse} mb-3`}>
          Reference one of the recipe's attached tools with{" "}
          <code class="code-hint">@tool(name)</code>, or{" "}
          <code class="code-hint">@tool(name, settings)</code>{" "}
          when that particular use has its own settings.
        </p>
        <div class="card space-y-3">
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Default settings (from the recipe's tool list)
            </div>
            <code class="code-hint">Preheat the @tool(oven).</code>
            <span class="text-stone-500 mx-2">&rarr;</span>
            <span>
              Preheat the <a href="#" class="link">oven</a> (180&nbsp;°C).
            </span>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Per-use settings
            </div>
            <code class="code-hint">
              Cream in the @tool(mixer, medium speed), then whip on @tool(mixer,
              high speed).
            </code>
          </div>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          The name matches an attached tool case-insensitively, and the typed
          name is used as the link label so it can follow the sentence's casing.
          The tool must be listed under the recipe's tools; an unattached name
          is flagged as an error in the editor.
        </p>
      </DocSection>

      <DocSection id="timers" title="Timers">
        <p class={`${docProse} mb-3`}>
          Embed interactive countdown timers using{" "}
          <code class="code-hint">@timer(duration)</code>. Duration supports
          hours (<code class="code-hint">h</code>), minutes (
          <code class="code-hint">m</code>), and seconds (
          <code class="code-hint">s</code>), which can be combined.
        </p>
        <div class="card space-y-3">
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Examples
            </div>
            <div class="space-y-1 font-mono text-sm">
              <div>
                <code class="code-hint">@timer(15m)</code>
                <span class="text-stone-500 mx-2">&rarr;</span>
                <span class="font-sans">15 minute timer</span>
              </div>
              <div>
                <code class="code-hint">@timer(1h30m)</code>
                <span class="text-stone-500 mx-2">&rarr;</span>
                <span class="font-sans">1 hour 30 minutes</span>
              </div>
              <div>
                <code class="code-hint">@timer(30s)</code>
                <span class="text-stone-500 mx-2">&rarr;</span>
                <span class="font-sans">30 seconds</span>
              </div>
              <div>
                <code class="code-hint">@timer(4-6m)</code>
                <span class="text-stone-500 mx-2">&rarr;</span>
                <span class="font-sans">
                  range timer: rings at 4 min, extendable to 6
                </span>
              </div>
            </div>
          </div>
          <div>
            <div class="text-xs font-bold uppercase text-stone-500 mb-1">
              Usage in a step
            </div>
            <code class="code-hint text-sm">
              Bake at 180°C for @timer(25m) until golden brown.
            </code>
          </div>
        </div>
        <p class="text-sm text-stone-500 mt-2">
          Timers render as inline buttons. Clicking starts a live countdown in a
          floating panel. Multiple timers can run at the same time. An alarm
          repeats until dismissed when a timer finishes.
        </p>
      </DocSection>

      <DocSection id="markdown" title="Markdown">
        <p class={`${docProse} mb-3`}>
          Step bodies support standard Markdown for formatting.
        </p>
        <div class="card overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-stone-200 dark:border-stone-700">
                <th class="text-left py-2 pr-4">Syntax</th>
                <th class="text-left py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4 font-mono">**bold**</td>
                <td class="py-2">
                  <strong>bold</strong>
                </td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4 font-mono">*italic*</td>
                <td class="py-2">
                  <em>italic</em>
                </td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4 font-mono">- item</td>
                <td class="py-2">Bullet list</td>
              </tr>
              <tr class="border-b border-stone-100 dark:border-stone-800">
                <td class="py-2 pr-4 font-mono">1. item</td>
                <td class="py-2">Numbered list</td>
              </tr>
              <tr>
                <td class="py-2 pr-4 font-mono">&gt; quote</td>
                <td class="py-2">Blockquote</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DocSection>
    </DocsPage>
  );
});
