import { handler, page } from "./$index.ts";
import type { RecipeDraft } from "../../../db/types.ts";
import { BackLink } from "../../../components/BackLink.tsx";
import ImportStart from "../../../islands/ImportStart.tsx";

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

    ctx.state.pageTitle = "Import Recipe";
    return { data: { drafts: draftsRes.rows } };
  },
});

export default page(function ImportIndexPage({ data }) {
  const sourceLabel = (source: string) => {
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
  };

  return (
    <div>
      <BackLink href="/recipes" label="Back to Recipes" />

      <h1 class="text-2xl font-bold mt-4 mb-2">Import Recipe</h1>
      <p class="text-sm text-stone-500 mb-6">
        Paste a URL, recipe text, or photos — any combination. The recipe is
        extracted and opened in the editor for you to review and save.
      </p>

      <ImportStart />

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
                        {" \u00b7 "}
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
