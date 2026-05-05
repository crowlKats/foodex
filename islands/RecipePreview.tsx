import { useSignal } from "@preact/signals";
import {
  type RenderIngredient,
  type RenderStep,
  renderStepsHtml,
} from "../lib/render-steps.ts";
import type { SectionInfo } from "../lib/step-sections.ts";
import TbEye from "tb-icons/TbEye";
import TbX from "tb-icons/TbX";

function RecipeHtml({ html }: { html: string }) {
  return (
    <div
      class="recipe-body"
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function RecipePreview() {
  const open = useSignal(false);
  const html = useSignal("");

  function collectFromForm(button: HTMLElement): string {
    const form = button.closest("form") as HTMLFormElement | null;
    if (!form) return "<p>No form found.</p>";

    const data = new FormData(form);

    const ingredients: RenderIngredient[] = [];
    let i = 0;
    while (data.has(`ingredients[${i}][name]`)) {
      const key = (data.get(`ingredients[${i}][key]`) as string) || "";
      const name = (data.get(`ingredients[${i}][name]`) as string) || "";
      const amount = parseFloat(
        (data.get(`ingredients[${i}][amount]`) as string) || "",
      ) || 0;
      const unit = (data.get(`ingredients[${i}][unit]`) as string) || "";
      if (key && name) {
        ingredients.push({ key, amount, unit, name });
      }
      i++;
    }

    // Sections — synthesize ids from form indices so the renderer can
    // wire them up to step.section_id below.
    const sections: SectionInfo[] = [];
    let s = 0;
    while (data.has(`sections[${s}][title]`)) {
      const title = (data.get(`sections[${s}][title]`) as string) || "";
      const key = (data.get(`sections[${s}][key]`) as string) || "";
      const afterStr = (data.get(`sections[${s}][after]`) as string) || "";
      const after = afterStr
        ? afterStr.split(",").map(Number).filter((n) => !isNaN(n))
        : [];
      sections.push({ id: `s${s}`, key, title, after });
      s++;
    }

    const steps: RenderStep[] = [];
    let j = 0;
    while (data.has(`steps[${j}][title]`) || data.has(`steps[${j}][body]`)) {
      const title = (data.get(`steps[${j}][title]`) as string) || "";
      const body = (data.get(`steps[${j}][body]`) as string) || "";
      const secIdxRaw = (data.get(`steps[${j}][section]`) as string) || "";
      const sectionIdx = secIdxRaw === "" ? null : parseInt(secIdxRaw);
      const section_id = sectionIdx != null && !isNaN(sectionIdx) &&
          sections[sectionIdx]
        ? sections[sectionIdx].id
        : null;
      if (title || body) {
        steps.push({ title, body, after: [], section_id });
      }
      j++;
    }

    if (steps.length === 0) {
      return "<p class='text-stone-500'>No steps to preview.</p>";
    }

    return renderStepsHtml(steps, sections, 1, ingredients);
  }

  function show(e: Event) {
    html.value = collectFromForm(e.currentTarget as HTMLElement);
    open.value = true;
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        class="btn btn-outline"
      >
        <TbEye class="size-4" />
        Preview
      </button>
      {open.value && (
        <div
          class="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-12 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) open.value = false;
            e.stopPropagation();
          }}
        >
          <div
            class="bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 w-full max-w-3xl max-h-[80vh] overflow-y-auto p-3 sm:p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold">Recipe Preview</h2>
              <button
                type="button"
                onClick={() => {
                  open.value = false;
                }}
                class="text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 cursor-pointer"
              >
                <TbX class="size-5" />
              </button>
            </div>
            <RecipeHtml html={html.value} />
          </div>
        </div>
      )}
    </>
  );
}
