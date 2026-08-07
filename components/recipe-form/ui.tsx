import type { ComponentChildren } from "preact";
import RecipeSubmitButton from "../../islands/RecipeSubmitButton.tsx";
import RecipePreview from "../../islands/RecipePreview.tsx";
import AskAssistant from "../../islands/AskAssistant.tsx";

/** A labelled band inside a card; groups related fields without a new card. */
export function SubGroup(
  { label, children }: { label: string; children: ComponentChildren },
) {
  return (
    <div class="subgroup">
      <span class="subgroup-label">{label}</span>
      <div class="space-y-3">{children}</div>
    </div>
  );
}

/**
 * Page title with its actions beside it, matching how `PageHeader` pairs a
 * `text-2xl` title with buttons on the index pages.
 */
export function FormActions(
  { title, submitLabel = "Save", assistant }: {
    title: string;
    submitLabel?: string;
    /** When set, an "Ask AI" popover that opens an assistant session on the recipe. */
    assistant?: { slug: string; title: string };
  },
) {
  return (
    <div class="form-actions">
      <h1 class="text-2xl font-bold truncate">{title}</h1>
      <div class="flex gap-2 shrink-0 items-center">
        {assistant && (
          <AskAssistant
            recipeSlug={assistant.slug}
            recipeTitle={assistant.title}
          />
        )}
        <RecipePreview />
        <RecipeSubmitButton label={submitLabel} />
      </div>
    </div>
  );
}
