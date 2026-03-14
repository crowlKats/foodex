import { useSignal } from "@preact/signals";
import { evaluateTemplate, scaleIngredients } from "../lib/template.ts";
import { marked } from "marked";
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

  function collectFromForm(): string {
    const form = document.querySelector("form") as HTMLFormElement | null;
    if (!form) return "<p>No form found.</p>";

    const data = new FormData(form);

    // Collect ingredients
    const ingredients: {
      key: string;
      amount: number;
      unit: string;
      name: string;
    }[] = [];
    let i = 0;
    while (data.has(`ingredients[${i}][name]`)) {
      const key = data.get(`ingredients[${i}][key]`) as string;
      const name = data.get(`ingredients[${i}][name]`) as string;
      const amount = parseFloat(
        data.get(`ingredients[${i}][amount]`) as string,
      ) || 0;
      const unit = data.get(`ingredients[${i}][unit]`) as string;
      if (key && name) {
        ingredients.push({ key, amount, unit: unit || "", name });
      }
      i++;
    }

    // Collect steps
    const steps: { title: string; body: string }[] = [];
    let j = 0;
    while (data.has(`steps[${j}][title]`) || data.has(`steps[${j}][body]`)) {
      const title = (data.get(`steps[${j}][title]`) as string) || "";
      const body = (data.get(`steps[${j}][body]`) as string) || "";
      if (title || body) {
        steps.push({ title, body });
      }
      j++;
    }

    if (steps.length === 0) {
      return "<p class='text-stone-500'>No steps to preview.</p>";
    }

    // Render
    const scaled = scaleIngredients(ingredients, 1);
    const vars: Record<string, number> = { ratio: 1 };
    const parts: string[] = [];

    for (const step of steps) {
      const evaluated = evaluateTemplate(step.body, vars, scaled);
      const rendered = marked.parse(evaluated);
      if (typeof rendered === "string") {
        const escapedTitle = step.title
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;");
        parts.push(
          `<h2 class="text-xl font-semibold mt-6 mb-3">${escapedTitle}</h2>\n${rendered}`,
        );
      }
    }

    return parts.join("\n");
  }

  function show() {
    html.value = collectFromForm();
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
        <div class="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-12 bg-black/50">
          <div class="bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 w-full max-w-3xl max-h-[80vh] overflow-y-auto p-3 sm:p-6 relative">
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
