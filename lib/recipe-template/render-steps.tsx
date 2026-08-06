/** @jsxRuntime automatic */
/** @jsxImportSource preact */

/**
 * The full recipe step renderer. Produces JSX for the entire step tree —
 * section headers, step titles, body markdown with directives substituted,
 * step images, and the various annotations (parallel/after).
 */

import type { VNode } from "preact";
import {
  computeSectionAnnotations,
  computeSectionLayout,
  type SectionInfo,
} from "../step-sections.ts";
import { computeStepAnnotations } from "../step-layout.ts";
import {
  type IngredientVar,
  type RecipeRefInfo,
  type RenderContext,
  renderTemplate,
  type TrayDims,
} from "./render.tsx";

export interface RenderStep {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
  after?: number[];
  section_id?: string | null;
}

export interface RecipeStepsProps {
  steps: RenderStep[];
  sections?: SectionInfo[];
  variables: Record<string, number>;
  ingredients?: Record<string, IngredientVar>;
  /** Tray size for dimensions recipes ({{ tray }} in step bodies). */
  tray?: TrayDims;
  recipeRefs?: Map<string, RecipeRefInfo>;
  dishRefs?: Map<string, RecipeRefInfo>;
  onTimerStart?: (seconds: number, label: string) => void;
}

/** Renders the full set of steps with sections, annotations, and media. */
export function RecipeSteps(props: RecipeStepsProps): VNode {
  const layout = computeSectionLayout(props.steps, props.sections);
  const ctx: RenderContext = {
    variables: props.variables,
    ingredients: props.ingredients,
    tray: props.tray,
    steps: props.steps,
    layout,
    recipeRefs: props.recipeRefs,
    dishRefs: props.dishRefs,
    onTimerStart: props.onTimerStart,
  };

  function refLabel(idx: number): string {
    const sid = props.steps[idx].section_id ?? null;
    const sec = sid ? layout.byId.get(sid) : null;
    const num = layout.displayNum[idx];
    const base = sec ? `${sec.title} step ${num}` : `step ${num}`;
    const t = props.steps[idx].title.trim();
    return t ? `${base} (${t})` : base;
  }

  const annotations = computeStepAnnotations(
    props.steps,
    refLabel,
    (i) => layout.bySectionId.get(props.steps[i].section_id ?? null) ?? [],
  );
  const sectionAnns = props.sections
    ? computeSectionAnnotations(props.sections)
    : [];

  const renderStep = (i: number): VNode => (
    <StepView
      key={i}
      index={i}
      step={props.steps[i]}
      anchor={layout.anchors[i]}
      displayNum={layout.displayNum[i]}
      annotation={annotations[i].annotation}
      ctx={ctx}
    />
  );

  const looseIdxs = layout.bySectionId.get(null) ?? [];
  const sections = props.sections ?? [];

  return (
    <>
      {looseIdxs.map(renderStep)}
      {sections.map((sec, sIdx) => {
        const stepIdxs = layout.bySectionId.get(sec.id) ?? [];
        if (stepIdxs.length === 0) return null;
        const ann = sectionAnns[sIdx];
        return (
          <section key={sec.id} class="recipe-section">
            <h2 class="recipe-section-title">{sec.title}</h2>
            {ann?.afterTitles?.length
              ? (
                <div class="recipe-section-note">
                  After {ann.afterTitles.join(" and ")}.
                </div>
              )
              : null}
            {ann?.parallelTitles?.length
              ? (
                <div class="recipe-section-note">
                  Runs in parallel with {ann.parallelTitles.join(" and ")}.
                </div>
              )
              : null}
            <div class="recipe-section-body">{stepIdxs.map(renderStep)}</div>
          </section>
        );
      })}
    </>
  );
}

/**
 * Render a single step body — used by cooking mode where we display one step
 * at a time without the surrounding section/title chrome.
 */
export function RecipeStepBody(props: {
  step: RenderStep;
  steps: RenderStep[];
  sections?: SectionInfo[];
  variables: Record<string, number>;
  ingredients?: Record<string, IngredientVar>;
  tray?: TrayDims;
  recipeRefs?: Map<string, RecipeRefInfo>;
  dishRefs?: Map<string, RecipeRefInfo>;
  onTimerStart?: (seconds: number, label: string) => void;
}): VNode {
  const layout = computeSectionLayout(props.steps, props.sections);
  const ctx: RenderContext = {
    variables: props.variables,
    ingredients: props.ingredients,
    tray: props.tray,
    steps: props.steps,
    layout,
    recipeRefs: props.recipeRefs,
    dishRefs: props.dishRefs,
    onTimerStart: props.onTimerStart,
  };
  return (
    <>
      {renderTemplate(props.step.body, ctx)}
      <StepMedia media={props.step.media} />
    </>
  );
}

// ── Internals ──────────────────────────────────────────────────────────────

function StepView(props: {
  index: number;
  step: RenderStep;
  anchor: string;
  displayNum: number;
  annotation: string | null;
  ctx: RenderContext;
}): VNode {
  const body = renderTemplate(props.step.body, props.ctx);
  const titleText = props.step.title.trim();
  return (
    <>
      {props.annotation
        ? (
          <div class="text-sm text-orange-600 dark:text-orange-400 italic mb-1">
            {props.annotation}
          </div>
        )
        : null}
      {titleText
        ? (
          <h3
            id={props.anchor}
            class="text-xl font-semibold mt-6 mb-3"
          >
            <span class="text-stone-400 mr-2">{props.displayNum}.</span>
            {titleText}
          </h3>
        )
        : (
          <>
            <h3 id={props.anchor} class="sr-only">Step {props.displayNum}</h3>
            <div class="mt-6 mb-3 text-sm font-semibold text-stone-400">
              {props.displayNum}.
            </div>
          </>
        )}
      {body}
      <StepMedia media={props.step.media} />
    </>
  );
}

function StepMedia(
  { media }: { media?: { id: string; url: string }[] },
): VNode | null {
  if (!media || media.length === 0) return null;
  return (
    <div class="flex flex-wrap gap-2 mt-3">
      {media.map((m) => (
        <img
          key={m.id}
          src={m.url}
          alt=""
          class="max-w-sm border-2 border-stone-300 dark:border-stone-700"
        />
      ))}
    </div>
  );
}
