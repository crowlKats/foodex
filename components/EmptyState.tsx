import type { ComponentChildren } from "preact";

interface EmptyStateProps {
  /** What's empty, as a statement — "No stores yet". */
  title: string;
  /** Why it's empty and what the thing is for. */
  children: ComponentChildren;
  /** Where to go next: a link, a button, a pointer at the form on the page. */
  action?: ComponentChildren;
}

/**
 * A bare "No stores yet." tells someone who has never used the feature nothing
 * about what a store is, why the list is empty, or what to do about it. Empty
 * states are the first thing a new user sees on most of these pages, so they
 * carry the explanation the page otherwise never gives.
 */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div class="card text-center py-8 space-y-2">
      <p class="font-medium">{title}</p>
      <p class="text-stone-500 text-sm max-w-md mx-auto">{children}</p>
      {action && (
        <div class="flex flex-wrap gap-2 justify-center pt-1">{action}</div>
      )}
    </div>
  );
}
