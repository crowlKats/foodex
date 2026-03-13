import { useSignal } from "@preact/signals";
import { evaluateTemplate } from "../lib/template.ts";
import { marked } from "marked";

function RecipeHtml({ html }: { html: string }) {
  return (
    <div
      class="bg-white rounded-lg shadow p-6 recipe-body"
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface RecipeViewProps {
  recipeBody: string;
  defaultServings: number;
  slug: string;
  hasSubRecipes: boolean;
  initialHtml: string;
}

export default function RecipeView(
  { recipeBody, defaultServings, slug, hasSubRecipes, initialHtml }:
    RecipeViewProps,
) {
  const servings = useSignal(defaultServings);
  const html = useSignal(initialHtml);
  const loading = useSignal(false);

  function updateHtml(newServings: number) {
    servings.value = newServings;

    // Client-side template evaluation (instant)
    const evaluated = evaluateTemplate(recipeBody, {
      servings: newServings,
    });
    const rendered = marked.parse(evaluated);
    if (typeof rendered === "string") {
      html.value = rendered;
    }

    // If there are sub-recipe refs, also fetch server-rendered version
    if (hasSubRecipes) {
      loading.value = true;
      fetch(`/api/recipes/${slug}/render?servings=${newServings}`)
        .then((r) => r.json())
        .then((data: { html: string }) => {
          html.value = data.html;
        })
        .finally(() => {
          loading.value = false;
        });
    }
  }

  return (
    <div>
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <label class="text-sm font-medium mr-3">Servings:</label>
        <div class="inline-flex items-center gap-2">
          <button
            type="button"
            class="w-8 h-8 rounded bg-gray-200 hover:bg-gray-300 font-bold"
            onClick={() => {
              if (servings.value > 1) updateHtml(servings.value - 1);
            }}
          >
            -
          </button>
          <input
            type="number"
            min="1"
            value={servings}
            class="w-16 text-center border rounded px-2 py-1"
            onInput={(e) => {
              const v = parseInt((e.target as HTMLInputElement).value);
              if (v > 0) updateHtml(v);
            }}
          />
          <button
            type="button"
            class="w-8 h-8 rounded bg-gray-200 hover:bg-gray-300 font-bold"
            onClick={() => updateHtml(servings.value + 1)}
          >
            +
          </button>
          {loading.value && (
            <span class="text-xs text-gray-400 ml-2">updating...</span>
          )}
        </div>
      </div>

      <RecipeHtml html={html.value} />
    </div>
  );
}
