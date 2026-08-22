import { handler, page } from "./$import.ts";
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
      "docs.importTitle",
    ).format();
    return { data: {} };
  },
});

export default page(function ImportDocs({ url }) {
  const trans = t.use();
  return (
    <DocsPage
      currentPath={url.pathname}
      title={trans("docs.importTitle")}
      intro="Get recipes in without typing them, and work on your library with an AI that stages every change for your review."
    >
      <DocSection id="assistant" title="The Assistant">
        <p class={`${docProse} mb-3`}>
          The <strong>Assistant</strong>{" "}
          page is a chat with an AI that knows your kitchen. It's a helping hand
          for the tedious parts: it can search your recipes and the web, import
          recipes from pages or photos, and rework what you already have ("make
          my pancakes vegan", "scale my bolognese to 6 servings").
        </p>
        <p class={`${docProse} mb-3`}>
          The important rule:{" "}
          <strong>
            the assistant never changes your library directly
          </strong>. Everything it proposes is <em>staged</em>{" "}
          for review, and nothing touches your recipes until you apply it.
        </p>
        <p class={`${docMuted} mb-4`}>
          Every conversation is saved. The Assistant page lists them all,
          searchable by title, so an import you started last week is still there
          to finish.
        </p>

        <DocSub title="Chatting">
          <p class={`${docProse} mb-4`}>
            Type a request, or attach photos with the photo button (pasting and
            drag-and-drop work too). While the assistant works you'll see its
            progress live: what it's searching, which pages it's fetching, what
            it's staging. A new chat offers starter suggestions if you're not
            sure what to ask.
          </p>
        </DocSub>

        <DocSub title="The Workbench">
          <p class={`${docProse} mb-3`}>
            The moment a recipe is staged, the session turns into a{" "}
            <strong>workbench</strong>: the full recipe editor takes over the
            main pane and the chat moves to a side panel (two tabs on a phone).
            You can:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-3">
            <li class={docProse}>
              <strong>Hand-edit</strong>{" "}
              the proposal in the normal recipe editor, and save your edits.
            </li>
            <li class={docProse}>
              Open <strong>Changes</strong>{" "}
              to see a field-by-field diff of what the assistant proposes: green
              for added, yellow for changed, red for removed.
            </li>
            <li class={docProse}>
              <strong>Preview</strong> the recipe as readers would see it.
            </li>
            <li class={docProse}>
              Keep chatting: ask for another tweak and the proposal updates.
            </li>
            <li class={docProse}>
              <strong>Revert</strong>{" "}
              your hand edits back to the assistant's version, or{" "}
              <strong>discard</strong> the proposal entirely.
            </li>
          </ul>
          <p class={`${docProse} mb-4`}>
            When you're happy, <strong>Save to library</strong>{" "}
            (for a new recipe) or <strong>Apply</strong>{" "}
            (for an edit) makes it real and takes you to the saved recipe.
          </p>
        </DocSub>

        <DocNote title="Advanced: staging details">
          <p>
            Staged items appear as pills above the chat composer; a session can
            hold several at once (a recipe plus the new catalog ingredients it
            needs, for example). Staged ingredients are applied to the shared
            catalog together with the recipe, and recipe lines not yet linked to
            a catalog entry are linked or created by name on apply.
          </p>
          <p>
            If someone edits the underlying recipe while a proposal is pending,
            applying flags a merge conflict and lists the clashing fields; the
            "Ask AI to resolve" button hands the conflict back to the assistant.
            And if the assistant updates an item while you have unsaved hand
            edits, you choose which version wins; your edits are never silently
            overwritten.
          </p>
        </DocNote>

        <DocSub title="Ask AI from a Recipe">
          <p class={`${docProse} mb-0`}>
            On any recipe's edit page, the <strong>Ask AI</strong>{" "}
            button starts an assistant session about that recipe: "make this
            vegetarian", "add a section for the sauce". The assistant sees the
            last saved version, so save your own edits first if they matter.
          </p>
        </DocSub>
      </DocSection>

      <DocSection id="import" title="Importing a Recipe">
        <p class={`${docProse} mb-3`}>
          <strong>Import Recipe</strong>{" "}
          takes a recipe in whatever form you have it and turns it into a proper
          Foodex recipe. Give it any combination of:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            A <strong>URL</strong> of a recipe page on the web.
          </li>
          <li class={docProse}>
            <strong>Photos</strong>: cookbook pages, screenshots, handwritten
            cards. Any language works, with automatic translation.
          </li>
          <li class={docProse}>
            Pasted <strong>text</strong>.
          </li>
          <li class={docProse}>
            Optional <strong>context</strong>{" "}
            for the extraction: the language, the recipe's name, how many it
            serves.
          </li>
        </ul>
        <p class={`${docProse} mb-3`}>
          The import runs as an assistant session and drops you straight into
          the workbench: the extracted recipe appears in the editor for you to
          check and save. Reviewing matters most for handwriting and unusual
          layouts; amounts are the thing to double-check.
        </p>
        <p class={`${docMuted} mb-4`}>
          Imports you never finished wait under "Pending Imports" on the import
          page (and in your Assistant conversations), so nothing is lost by
          closing the tab.
        </p>

        <DocSub title="Bulk Import">
          <p class={`${docProse} mb-3`}>
            To capture a whole recipe book, use{" "}
            <strong>Bulk import</strong>: photograph every page, drop the lot
            in, and group the pages so each group is one recipe. Merge a photo
            into the previous group when a recipe spans pages; a full-screen
            viewer helps you compare neighboring pages while grouping.
          </p>
          <p class={`${docProse} mb-0`}>
            One click then imports them all, a couple at a time, with per-recipe
            progress. Each becomes a regular assistant session you review at
            your own pace, now or later.
          </p>
        </DocSub>
      </DocSection>
    </DocsPage>
  );
});
