import { marked } from "marked";

marked.use({ renderer: { html: () => "" } });
import { evaluateTemplate, type IngredientVar } from "./template.ts";
import { replaceTimers } from "./timer.ts";
import { computeStepAnnotations } from "./step-layout.ts";
import {
  computeSectionAnnotations,
  computeSectionLayout,
  type SectionInfo,
} from "./step-sections.ts";

export interface RecipeRef {
  title: string;
  slug: string;
}

export type Section = SectionInfo;

export interface Step {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
  after?: number[];
  section_id?: string | null;
}

export type RecipeResolver = (slug: string) => Promise<RecipeRef | null>;

export async function renderRecipeSteps(
  steps: Step[],
  variables: Record<string, number>,
  ingredients?: Record<string, IngredientVar>,
  resolveRecipe?: RecipeResolver,
  sections?: Section[],
): Promise<string> {
  const layout = computeSectionLayout(steps, sections);

  function refLabel(idx: number, includeTitle: boolean): string {
    const sid = steps[idx].section_id ?? null;
    const sec = sid ? layout.byId.get(sid) : null;
    const num = layout.displayNum[idx];
    const base = sec ? `${sec.title} step ${num}` : `step ${num}`;
    if (!includeTitle) return base;
    const t = steps[idx].title.trim();
    return t ? `${base} (${t})` : base;
  }

  const stepHtmls: string[] = [];
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    let result = evaluateTemplate(step.body, variables, ingredients);

    // @step(key.N) — section-relative reference
    result = result.replace(
      /@step\(([a-z0-9_-]+)\.(\d+)\)/g,
      (_match, key: string, num: string) => {
        const sec = layout.byKey.get(key);
        if (!sec) return `*unknown section: ${key}*`;
        const indices = layout.bySectionId.get(sec.id) ?? [];
        const n = parseInt(num);
        if (n < 1 || n > indices.length) {
          return `*unknown step: ${key}.${num}*`;
        }
        const targetIdx = indices[n - 1];
        return `[${refLabel(targetIdx, true)}](#${layout.anchors[targetIdx]})`;
      },
    );

    // @step(N) — global reference (1-based across all steps)
    result = result.replace(/@step\((\d+)\)/g, (_match, num: string) => {
      const n = parseInt(num);
      if (n < 1 || n > steps.length) return `*unknown step: ${num}*`;
      const targetIdx = n - 1;
      const t = steps[targetIdx].title.trim();
      const label = t ? `step ${n} (${t})` : `step ${n}`;
      return `[${label}](#${layout.anchors[targetIdx]})`;
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
          result = result.replace(
            match[0],
            `[${safeTitle}](/recipes/${safeSlug})`,
          );
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
          `<img src="${
            escapeHtml(m.url)
          }" alt="" class="max-w-sm border-2 border-stone-300 dark:border-stone-700" />`
        ).join("")
      }</div>`;
    }
    stepHtmls.push(html);
  }

  // Annotations for parallel/merge steps — use refLabel so they pick up section context
  const annotations = computeStepAnnotations(steps, (idx) => {
    return escapeHtml(refLabel(idx, true));
  });

  const parts: string[] = [];
  const sectionAnns = sections ? computeSectionAnnotations(sections) : [];
  let currentSectionId: string | null | undefined = undefined;
  let openSection = false;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const sid = step.section_id ?? null;
    if (sid !== currentSectionId) {
      if (openSection) {
        parts.push(`</div></section>`);
        openSection = false;
      }
      const sec = sid ? layout.byId.get(sid) : null;
      if (sec) {
        const partIdx = (sections ?? []).findIndex((s) => s.id === sec.id);
        const ann = sectionAnns[partIdx];
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
        openSection = true;
      }
      currentSectionId = sid;
    }
    const ann = annotations[i].annotation;
    let stepHtml = "";

    if (ann) {
      stepHtml +=
        `<div class="text-sm text-orange-600 dark:text-orange-400 italic mb-1">${
          escapeHtml(ann)
        }</div>`;
    }

    const num = layout.displayNum[i];
    const anchor = layout.anchors[i];
    stepHtml +=
      `<h3 id="${anchor}" class="text-xl font-semibold mt-6 mb-3"><span class="text-stone-400 mr-2">${num}.</span>${
        escapeHtml(step.title)
      }</h3>\n${stepHtmls[i]}`;
    parts.push(stepHtml);
  }
  if (openSection) parts.push(`</div></section>`);

  return parts.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
