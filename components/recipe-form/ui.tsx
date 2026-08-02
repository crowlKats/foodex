import type { ComponentChildren } from "preact";
import { ButtonLink } from "../Button.tsx";
import RecipeSubmitButton from "../../islands/RecipeSubmitButton.tsx";
import RecipePreview from "../../islands/RecipePreview.tsx";

/** A labelled band inside a card — groups related fields without a new card. */
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
  { title, viewHref }: { title: string; viewHref: string },
) {
  return (
    <div class="form-actions">
      <h1 class="text-2xl font-bold truncate">{title}</h1>
      <div class="flex gap-2 shrink-0 items-center">
        <ButtonLink href={viewHref} variant="outline">View</ButtonLink>
        <RecipePreview />
        <RecipeSubmitButton label="Save" />
      </div>
    </div>
  );
}
