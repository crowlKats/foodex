import { marked } from "marked";

marked.use({ renderer: { html: () => "" } });
import { evaluateTemplate, type IngredientVar } from "./template.ts";
import { replaceTimers } from "./timer.ts";
import { computeStepAnnotations } from "./step-layout.ts";

export interface RecipeRef {
  title: string;
  slug: string;
}

export interface Step {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
  column?: number;
  after?: number[];
}

export type RecipeResolver = (slug: string) => Promise<RecipeRef | null>;

export async function renderRecipeSteps(
  steps: Step[],
  variables: Record<string, number>,
  ingredients?: Record<string, IngredientVar>,
  resolveRecipe?: RecipeResolver,
): Promise<string> {
  // Render each step's body HTML
  const stepHtmls: string[] = [];
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    let result = evaluateTemplate(step.body, variables, ingredients);

    const stepPattern = /@step\((\d+)\)/g;
    result = result.replace(stepPattern, (_match, num: string) => {
      const n = parseInt(num);
      if (n < 1 || n > steps.length) return `*unknown step: ${num}*`;
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
          const safeTitle = ref.title.replace(/[\[\]\\]/g, (c) => `\\${c}`);
          const safeSlug = encodeURIComponent(ref.slug);
          result = result.replace(match[0], `[${safeTitle}](/recipes/${safeSlug})`);
        } else {
          const safeSlug = slug.replace(/[\[\]\\*_]/g, (c) => `\\${c}`);
          result = result.replace(match[0], `*unknown recipe: ${safeSlug}*`);
        }
      }
    }

    let html = replaceTimers(await marked.parse(result));
    if (step.media && step.media.length > 0) {
      html += `<div class="flex flex-wrap gap-2 mt-3">${
        step.media.map((m) =>
          `<img src="${escapeHtml(m.url)}" alt="" class="max-w-sm border-2 border-stone-300 dark:border-stone-700" />`
        ).join("")
      }</div>`;
    }
    stepHtmls.push(html);
  }

  // Compute annotations for parallel/merge steps
  const annotations = computeStepAnnotations(steps, (idx) => {
    const t = steps[idx].title.trim();
    return t ? `step ${idx + 1} (${escapeHtml(t)})` : `step ${idx + 1}`;
  });

  const parts: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const ann = annotations[i].annotation;
    let stepHtml = "";

    if (ann) {
      stepHtml += `<div class="text-sm text-orange-600 dark:text-orange-400 italic mb-1">${escapeHtml(ann)}</div>`;
    }

    stepHtml += `<h2 id="step-${i + 1}" class="text-xl font-semibold mt-6 mb-3"><span class="text-stone-400 mr-2">${i + 1}.</span>${escapeHtml(step.title)}</h2>\n${stepHtmls[i]}`;
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
