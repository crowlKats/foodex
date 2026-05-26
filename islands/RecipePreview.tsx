import { useSignal } from "@preact/signals";
import { RecipeSteps } from "../lib/recipe-template/render-steps.tsx";
import { scaleIngredients } from "../lib/recipe-template/render.tsx";
import type { SectionInfo } from "../lib/step-sections.ts";
import { recipeErrorCount } from "../lib/recipe-errors.ts";
import TbEye from "tb-icons/TbEye";
import TbX from "tb-icons/TbX";
import { Button } from "../components/Button.tsx";

interface RenderStep {
  title: string;
  body: string;
  after?: number[];
  section_id?: string | null;
}

interface RenderIngredient {
  key: string;
  amount: number;
  unit: string;
  name: string;
}

interface PreviewData {
  steps: RenderStep[];
  sections: SectionInfo[];
  ingredients: RenderIngredient[];
}

export default function RecipePreview() {
  const open = useSignal(false);
  const data = useSignal<PreviewData | null>(null);
  const message = useSignal<string | null>(null);

  function collectFromForm(button: HTMLElement): PreviewData | null {
    const form = button.closest("form") as HTMLFormElement | null;
    if (!form) {
      message.value = "No form found.";
      return null;
    }

    const fd = new FormData(form);

    const ingredients: RenderIngredient[] = [];
    let i = 0;
    while (fd.has(`ingredients[${i}][name]`)) {
      const key = (fd.get(`ingredients[${i}][key]`) as string) || "";
      const name = (fd.get(`ingredients[${i}][name]`) as string) || "";
      const amount = parseFloat(
        (fd.get(`ingredients[${i}][amount]`) as string) || "",
      ) || 0;
      const unit = (fd.get(`ingredients[${i}][unit]`) as string) || "";
      if (key && name) ingredients.push({ key, amount, unit, name });
      i++;
    }

    const sections: SectionInfo[] = [];
    let s = 0;
    while (fd.has(`sections[${s}][title]`)) {
      const title = (fd.get(`sections[${s}][title]`) as string) || "";
      const key = (fd.get(`sections[${s}][key]`) as string) || "";
      const afterStr = (fd.get(`sections[${s}][after]`) as string) || "";
      const after = afterStr
        ? afterStr.split(",").map(Number).filter((n) => !isNaN(n))
        : [];
      sections.push({ id: `s${s}`, key, title, after });
      s++;
    }

    const steps: RenderStep[] = [];
    let j = 0;
    while (fd.has(`steps[${j}][title]`) || fd.has(`steps[${j}][body]`)) {
      const title = (fd.get(`steps[${j}][title]`) as string) || "";
      const body = (fd.get(`steps[${j}][body]`) as string) || "";
      const secIdxRaw = (fd.get(`steps[${j}][section]`) as string) || "";
      const sectionIdx = secIdxRaw === "" ? null : parseInt(secIdxRaw);
      const section_id = sectionIdx != null && !isNaN(sectionIdx) &&
          sections[sectionIdx]
        ? sections[sectionIdx].id
        : null;
      if (title || body) steps.push({ title, body, after: [], section_id });
      j++;
    }

    if (steps.length === 0) {
      message.value = "No steps to preview.";
      return null;
    }

    message.value = null;
    return { steps, sections, ingredients };
  }

  function show(e: Event) {
    data.value = collectFromForm(e.currentTarget as HTMLElement);
    open.value = true;
  }

  return (
    <>
      <Button
        type="button"
        onClick={show}
        variant="outline"
        icon={TbEye}
        disabled={recipeErrorCount.value > 0}
        title={recipeErrorCount.value > 0
          ? "Fix the errors in the step bodies first."
          : undefined}
      >
        Preview
      </Button>
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
              <Button
                type="button"
                variant="ghost"
                icon={TbX}
                title="Close"
                onClick={() => {
                  open.value = false;
                }}
              />
            </div>
            {message.value && <p class="text-stone-500">{message.value}</p>}
            {data.value && (
              <div class="recipe-body">
                <RecipeSteps
                  steps={data.value.steps}
                  sections={data.value.sections}
                  variables={{ ratio: 1 }}
                  ingredients={scaleIngredients(data.value.ingredients, 1)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
