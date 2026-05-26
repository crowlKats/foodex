import { Button } from "../components/Button.tsx";
import { recipeErrorCount } from "../lib/recipe-errors.ts";

/**
 * `<Button type="submit">` that auto-disables itself when any step body in
 * the recipe form has unresolved errors. Renders an inline "N errors"
 * indicator next to itself so the user knows *why* it's disabled (a
 * disabled button can't surface a `title` tooltip).
 *
 * Used on edit pages where the form root is server-rendered so we can't
 * reach `recipeErrorCount` from a route.
 */
export default function RecipeSubmitButton(
  { label }: { label: string },
) {
  const blocked = recipeErrorCount.value > 0;
  return (
    <>
      <Button type="submit" disabled={blocked}>
        {label}
      </Button>
      {blocked && (
        <span class="text-xs text-red-600 dark:text-red-400 self-center">
          {recipeErrorCount.value}{" "}
          error{recipeErrorCount.value === 1 ? "" : "s"} in step bodies
        </span>
      )}
    </>
  );
}
