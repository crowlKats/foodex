import type { ComponentChildren } from "preact";
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

/** Save/preview rail that stays put while the form scrolls under it. */
export function StickyActions({ title }: { title: string }) {
  return (
    <div class="sticky-actions">
      <h1 class="text-lg font-bold truncate">{title}</h1>
      <div class="flex gap-2 shrink-0 items-center">
        <RecipeSubmitButton label="Save" />
        <RecipePreview />
      </div>
    </div>
  );
}
