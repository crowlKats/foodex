import { marked } from "marked";

marked.use({ renderer: { html: () => "" } });
import { evaluateTemplate, type IngredientVar } from "./template.ts";

export interface RecipeRef {
  title: string;
  slug: string;
}

export interface Step {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
}

export type RecipeResolver = (slug: string) => Promise<RecipeRef | null>;

export async function renderRecipeSteps(
  steps: Step[],
  variables: Record<string, number>,
  ingredients?: Record<string, IngredientVar>,
  resolveRecipe?: RecipeResolver,
): Promise<string> {
  const parts: string[] = [];

  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    let result = evaluateTemplate(step.body, variables, ingredients);

    // Resolve step references: @step(N) → link to step N
    const stepPattern = /@step\((\d+)\)/g;
    result = result.replace(stepPattern, (_match, num: string) => {
      const n = parseInt(num);
      if (n < 1 || n > steps.length) {
        return `*unknown step: ${num}*`;
      }
      const title = steps[n - 1].title;
      const label = title ? `step ${n} (${title})` : `step ${n}`;
      return `[${label}](#step-${n})`;
    });

    if (resolveRecipe) {
      const recipePattern = /@recipe\(([a-z0-9_-]+)\)/g;
      const matches = [...result.matchAll(recipePattern)];
      for (const match of matches) {
        const slug = match[1];
        const ref = await resolveRecipe(slug);
        if (ref) {
          result = result.replace(
            match[0],
            `[${ref.title}](/recipes/${ref.slug})`,
          );
        } else {
          result = result.replace(match[0], `*unknown recipe: ${slug}*`);
        }
      }
    }

    const html = await marked.parse(result);
    let stepHtml =
      `<h2 id="step-${si + 1}" class="text-xl font-semibold mt-6 mb-3"><span class="text-stone-400 mr-2">${
        si + 1
      }.</span>${escapeHtml(step.title)}</h2>\n${html}`;

    if (step.media && step.media.length > 0) {
      stepHtml += `<div class="flex flex-wrap gap-2 mt-3">${
        step.media.map((m) =>
          `<img src="${
            escapeHtml(m.url)
          }" alt="" class="max-w-sm border-2 border-stone-300" />`
        ).join("")
      }</div>`;
    }

    parts.push(stepHtml);
  }

  return parts.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
