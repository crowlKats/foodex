/**
 * Cross-island error tracking for the recipe editor.
 *
 * Step bodies are edited inside `<StepBodyEditor>` instances rendered by the
 * `<StepForm>` island, but the Save / Preview buttons that need to react
 * to those errors live in sibling islands (`<RecipePreview>`,
 * `<SubmitWhenValid>`). Preact signals are shared across islands on the
 * client, so each editor publishes its error count here, and the buttons
 * subscribe.
 *
 * Each editor calls `registerErrorTracker()` once on mount, receives an
 * `update(count)` setter, and calls `unregister()` on unmount. The exported
 * `recipeErrorCount` is a `computed` that sums all live trackers.
 */

import { computed, signal } from "@preact/signals";

const counts = signal<Map<symbol, number>>(new Map());

/** Total number of unresolved errors across every live step body editor. */
export const recipeErrorCount = computed(() => {
  let total = 0;
  for (const v of counts.value.values()) total += v;
  return total;
});

export interface ErrorTracker {
  update(count: number): void;
  unregister(): void;
}

/**
 * Register a new error tracker. Call `update(count)` whenever the tracker's
 * diagnostic set changes; call `unregister()` on unmount.
 */
export function registerErrorTracker(): ErrorTracker {
  const id = Symbol("recipe-error-tracker");
  // Map mutation goes through a fresh copy so the signal triggers a render.
  const init = new Map(counts.value);
  init.set(id, 0);
  counts.value = init;
  return {
    update(count: number) {
      const cur = counts.value.get(id);
      if (cur === count) return;
      const next = new Map(counts.value);
      next.set(id, count);
      counts.value = next;
    },
    unregister() {
      if (!counts.value.has(id)) return;
      const next = new Map(counts.value);
      next.delete(id);
      counts.value = next;
    },
  };
}
