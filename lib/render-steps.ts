// Shared client-side recipe step renderer. Used by RecipeView (the recipe
// view page) and RecipePreview (the edit-page modal preview), so both stay
// in sync — one source of truth for step rendering.
//
// Mirrors `renderRecipeSteps` in lib/markdown.ts but is sync (no @recipe()
// resolution; that's a server-only concern).

import { marked } from "marked";
import { evaluateTemplate, scaleIngredients } from "./template.ts";
import { replaceTimers } from "./timer.ts";
import { computeStepAnnotations } from "./step-layout.ts";
import {
  computeSectionAnnotations,
  computeSectionLayout,
  type SectionInfo,
} from "./step-sections.ts";

marked.use({ renderer: { html: () => "" } });

export interface RenderStep {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
  after?: number[];
  section_id?: string | null;
}

export interface RenderIngredient {
  key: string;
  amount: number;
  unit: string;
  name: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderStepBody(
  step: RenderStep,
  steps: RenderStep[],
  vars: Record<string, number>,
  scaled: ReturnType<typeof scaleIngredients>,
  layout: ReturnType<typeof computeSectionLayout>,
): string {
  let evaluated = evaluateTemplate(step.body, vars, scaled);

  evaluated = evaluated.replace(
    /@step\(([a-z0-9_-]+)\.(\d+)\)/g,
    (_m, key: string, num: string) => {
      const sec = layout.byKey.get(key);
      if (!sec) return `*unknown section: ${key}*`;
      const indices = layout.bySectionId.get(sec.id) ?? [];
      const n = parseInt(num);
      if (n < 1 || n > indices.length) {
        return `*unknown step: ${key}.${num}*`;
      }
      const targetIdx = indices[n - 1];
      const title = steps[targetIdx].title;
      const base = `${sec.title} step ${n}`;
      const label = title ? `${base} (${title})` : base;
      return `[${label}](#${layout.anchors[targetIdx]})`;
    },
  );

  evaluated = evaluated.replace(/@step\((\d+)\)/g, (_m, num: string) => {
    const n = parseInt(num);
    if (n < 1 || n > steps.length) return `*unknown step: ${num}*`;
    const targetIdx = n - 1;
    const title = steps[targetIdx].title;
    const label = title ? `step ${n} (${title})` : `step ${n}`;
    return `[${label}](#${layout.anchors[targetIdx]})`;
  });

  const parsed = marked.parse(evaluated);
  const html = typeof parsed === "string" ? replaceTimers(parsed) : parsed;
  if (typeof html !== "string") return "";

  let stepHtml = html;
  if (step.media && step.media.length > 0) {
    stepHtml += `<div class="flex flex-wrap gap-2 mt-3">${
      step.media.map((m) =>
        `<img src="${
          escapeHtml(m.url)
        }" alt="" class="max-w-sm border-2 border-stone-300 dark:border-stone-700" />`
      ).join("")
    }</div>`;
  }
  return stepHtml;
}

/**
 * Render the full set of recipe steps to HTML. Sections (when present) are
 * rendered as `<section>` containers grouping their steps; loose steps come
 * first.
 */
export function renderStepsHtml(
  steps: RenderStep[],
  sections: SectionInfo[] | undefined,
  ratio: number,
  ingredients: RenderIngredient[],
): string {
  const scaled = scaleIngredients(ingredients, ratio);
  const vars: Record<string, number> = { ratio };
  const layout = computeSectionLayout(steps, sections);

  const stepHtmls = steps.map((step) =>
    renderStepBody(step, steps, vars, scaled, layout)
  );

  const annotations = computeStepAnnotations(
    steps,
    (idx) => {
      const t = steps[idx].title.trim();
      const sid = steps[idx].section_id ?? null;
      const sec = sid ? layout.byId.get(sid) : null;
      const num = layout.displayNum[idx];
      const base = sec ? `${sec.title} step ${num}` : `step ${num}`;
      return t ? `${escapeHtml(base)} (${escapeHtml(t)})` : escapeHtml(base);
    },
    (i) => layout.bySectionId.get(steps[i].section_id ?? null) ?? [],
  );

  const sectionAnns = sections ? computeSectionAnnotations(sections) : [];
  const parts: string[] = [];

  function renderStep(i: number): string {
    const step = steps[i];
    const ann = annotations[i].annotation;
    let html = "";
    if (ann) {
      html +=
        `<div class="text-sm text-orange-600 dark:text-orange-400 italic mb-1">${
          escapeHtml(ann)
        }</div>`;
    }
    const num = layout.displayNum[i];
    const anchor = layout.anchors[i];
    const titleText = step.title.trim();
    html += titleText
      ? `<h3 id="${anchor}" class="text-xl font-semibold mt-6 mb-3"><span class="text-stone-400 mr-2">${num}.</span>${
        escapeHtml(titleText)
      }</h3>\n${stepHtmls[i]}`
      : `<h3 id="${anchor}" class="sr-only">Step ${num}</h3><div class="mt-6 mb-3 text-sm font-semibold text-stone-400">${num}.</div>\n${
        stepHtmls[i]
      }`;
    return html;
  }

  const looseIdxs = layout.bySectionId.get(null) ?? [];
  for (const i of looseIdxs) parts.push(renderStep(i));

  for (let sIdx = 0; sIdx < (sections ?? []).length; sIdx++) {
    const sec = sections![sIdx];
    const stepIdxs = layout.bySectionId.get(sec.id) ?? [];
    if (stepIdxs.length === 0) continue;
    const ann = sectionAnns[sIdx];
    let annHtml = "";
    if (ann?.afterTitles?.length) {
      annHtml += `<div class="recipe-section-note">After ${
        ann.afterTitles.map(escapeHtml).join(" and ")
      }.</div>`;
    }
    if (ann?.parallelTitles?.length) {
      annHtml += `<div class="recipe-section-note">Runs in parallel with ${
        ann.parallelTitles.map(escapeHtml).join(" and ")
      }.</div>`;
    }
    parts.push(
      `<section class="recipe-section">` +
        `<h2 class="recipe-section-title">${escapeHtml(sec.title)}</h2>` +
        annHtml +
        `<div class="recipe-section-body">`,
    );
    for (const i of stepIdxs) parts.push(renderStep(i));
    parts.push(`</div></section>`);
  }

  return parts.join("\n");
}

/** Render a single step (used by cooking mode for one-step-at-a-time view). */
export function renderSingleStepHtml(
  steps: RenderStep[],
  sections: SectionInfo[] | undefined,
  index: number,
  ratio: number,
  ingredients: RenderIngredient[],
): string {
  const scaled = scaleIngredients(ingredients, ratio);
  const vars: Record<string, number> = { ratio };
  const layout = computeSectionLayout(steps, sections);
  return renderStepBody(steps[index], steps, vars, scaled, layout);
}
