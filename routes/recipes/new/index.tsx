import { handler, page } from "./$index.ts";
import type { RecipeDraft } from "../../../db/types.ts";
import { BackLink } from "../../../components/BackLink.tsx";
import RecipeStart from "../../../islands/RecipeStart.tsx";

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const draftsRes = await ctx.state.db.query<RecipeDraft>(
      `SELECT id, recipe_data, source, updated_at
       FROM recipe_drafts
       WHERE household_id = $1 AND source IN ('ocr', 'generate', 'url', 'text')
       ORDER BY updated_at DESC`,
      [ctx.state.householdId],
    );

    ctx.state.pageTitle = "New Recipe";
    return { data: { drafts: draftsRes.rows } };
  },
});

function sourceLabel(source: string): string {
  switch (source) {
    case "ocr":
      return "Imported from image";
    case "url":
      return "Imported from URL";
    case "text":
      return "Imported from text";
    default:
      return "Generated from pantry";
  }
}

export default page(function NewRecipePage({ data }) {
  // The back link sits inside the column so it lines up with the title rather
  // than the page edge.
  return (
    <div class="max-w-2xl mx-auto">
      <BackLink href="/recipes" label="Back to Recipes" />

      <h1 class="text-2xl font-bold mt-4 mb-2">New Recipe</h1>
      <p class="text-sm text-stone-500 mb-4">
        Enter a link to import from, the recipe itself, photos of a page,
        instructions, or any mix of them. You review the result before anything
        is saved.
      </p>

      <RecipeStart />

      <p class="text-sm text-stone-500 mt-4 space-x-4">
        <a href="/recipes/new/manual" class="link">
          Type it in the editor yourself →
        </a>
        <a href="/recipes/import/bulk" class="link">
          Importing a whole book? Bulk import →
        </a>
      </p>

      {data.drafts.length > 0 && (
        <div class="mt-8">
          <h2 class="text-lg font-semibold mb-3">
            Pending Imports ({data.drafts.length})
          </h2>
          <div class="space-y-2">
            {data.drafts.map((d) => {
              const title = (d.recipe_data as Record<string, unknown>)?.title;
              return (
                <a
                  key={d.id}
                  href={`/recipes/drafts/${d.id}`}
                  class="block card card-hover"
                >
                  <div class="flex items-center gap-3">
                    <div class="flex-1">
                      <div class="font-medium">
                        {title ? String(title) : "Untitled draft"}
                      </div>
                      <div class="text-xs text-stone-400">
                        {sourceLabel(d.source)}
                        {" · "}
                        {new Date(d.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span class="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                      draft
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
