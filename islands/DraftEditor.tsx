import { useSignal } from "@preact/signals";
import type { OcrRecipeData } from "../lib/ocr.ts";
import RefineInput from "./RefineInput.tsx";
import type { AiMessage } from "./RefineInput.tsx";
import QuantityInput from "./QuantityInput.tsx";
import IngredientForm from "./IngredientForm.tsx";
import ToolForm from "./ToolForm.tsx";
import StepForm from "./StepForm.tsx";
import MediaUpload from "./MediaUpload.tsx";
import RecipePreview from "./RecipePreview.tsx";
import ConfirmButton from "./ConfirmButton.tsx";

interface CoverMedia {
  id: string;
  url: string;
  filename: string;
  content_type: string;
}

interface Props {
  draftId: string;
  initialRecipe: OcrRecipeData;
  aiMessages: AiMessage[];
  hasAi: boolean;
  coverImage: CoverMedia | null;
  ingredients: { id: string; name: string; unit: string }[];
  allTools: { id: string; name: string }[];
  allRecipes: { id: string; title: string }[];
}

function formatDuration(
  minutes: number | null,
): { value: string; unit: string } {
  if (minutes == null) return { value: "", unit: "min" };
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: String(minutes / 60), unit: "hr" };
  }
  return { value: String(minutes), unit: "min" };
}

export default function DraftEditor({
  draftId,
  initialRecipe,
  aiMessages: initialAiMessages,
  hasAi,
  coverImage,
  ingredients,
  allTools,
  allRecipes,
}: Props) {
  const recipe = useSignal<OcrRecipeData>(initialRecipe);
  const aiMessages = useSignal<AiMessage[]>(initialAiMessages);
  const version = useSignal(0);
  const saving = useSignal(false);

  function onRecipeUpdate(updated: OcrRecipeData) {
    recipe.value = updated;
    version.value = version.value + 1;
  }

  async function saveDraft() {
    saving.value = true;
    // Read current form state
    const form = document.querySelector<HTMLFormElement>("#draft-form");
    if (!form) {
      saving.value = false;
      return;
    }

    const fd = new FormData(form);
    const recipeData = formDataToRecipeData(fd);

    await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_data: recipeData }),
    });
    saving.value = false;
  }

  async function discardDraft() {
    await fetch(`/api/drafts/${draftId}`, { method: "DELETE" });
    globalThis.location.href = "/recipes";
  }

  const r = recipe.value;
  const prep = formatDuration(r.prep_time);
  const cook = formatDuration(r.cook_time);
  const v = version.value;

  return (
    <div>
      {hasAi && (
        <RefineInput
          draftId={draftId}
          initialHistory={aiMessages.value}
          onRecipeUpdate={onRecipeUpdate}
          onHistoryUpdate={(msgs) => {
            aiMessages.value = msgs;
          }}
        />
      )}

      <form id="draft-form" method="POST" class="space-y-6">
        <input type="hidden" name="draft_id" value={draftId} />

        <div class="card">
          <h2 class="section-title">Cover Image</h2>
          <MediaUpload
            key={`cover-${v}`}
            name="cover_image_id"
            accept="image/*"
            initialMedia={coverImage ? [coverImage] : undefined}
          />
        </div>

        <div class="card space-y-3">
          <h2 class="font-semibold">Details</h2>
          <div>
            <label class="block text-sm font-medium mb-1">Title</label>
            <input
              key={`title-${v}`}
              type="text"
              name="title"
              required
              class="w-full"
              value={r.title ?? ""}
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <textarea
              key={`desc-${v}`}
              name="description"
              rows={2}
              class="w-full"
            >
              {r.description ?? ""}
            </textarea>
          </div>
          <QuantityInput
            key={`qty-${v}`}
            initialType={r.quantity_type ?? "servings"}
            initialValue={r.quantity_value ?? 4}
            initialUnit={r.quantity_unit ?? "servings"}
          />
          <div class="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label class="block text-sm font-medium mb-1">Prep time</label>
              <div class="flex">
                <input
                  key={`prep-${v}`}
                  type="number"
                  name="prep_time"
                  min="0"
                  value={prep.value}
                  class="flex-1"
                />
                <select
                  key={`prepu-${v}`}
                  name="prep_time_unit"
                  class="w-20 text-xs -ml-0.5"
                >
                  <option value="min" selected={prep.unit === "min"}>
                    min
                  </option>
                  <option value="hr" selected={prep.unit === "hr"}>hr</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Cook time</label>
              <div class="flex">
                <input
                  key={`cook-${v}`}
                  type="number"
                  name="cook_time"
                  min="0"
                  value={cook.value}
                  class="flex-1"
                />
                <select
                  key={`cooku-${v}`}
                  name="cook_time_unit"
                  class="w-20 text-xs -ml-0.5"
                >
                  <option value="min" selected={cook.unit === "min"}>
                    min
                  </option>
                  <option value="hr" selected={cook.unit === "hr"}>hr</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Difficulty</label>
            <select
              key={`diff-${v}`}
              name="difficulty"
              class="w-full"
            >
              <option value="">—</option>
              <option value="easy" selected={r.difficulty === "easy"}>
                Easy
              </option>
              <option value="medium" selected={r.difficulty === "medium"}>
                Medium
              </option>
              <option value="hard" selected={r.difficulty === "hard"}>
                Hard
              </option>
            </select>
          </div>
          <label class="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              key={`private-${v}`}
              type="checkbox"
              name="private"
              class="size-4 accent-orange-600"
            />
            <span class="text-sm">
              Private (only visible to household members)
            </span>
          </label>
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Ingredients</h2>
          <IngredientForm
            key={`ing-${v}`}
            initialIngredients={(r.ingredients ?? []).map((ing) => ({
              key: ing.key ?? "",
              name: ing.name ?? "",
              amount: ing.amount != null ? String(ing.amount) : "",
              unit: ing.unit ?? "",
              ingredient_id: "",
            }))}
            ingredients={ingredients}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Tools</h2>
          <ToolForm
            key={`tools-${v}`}
            initialTools={[]}
            tools={allTools}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Steps</h2>
          <p class="text-xs text-stone-500 mb-2">
            Use <code class="code-hint">{"{{ key }}"}</code>{" "}
            for scaled ingredients,{" "}
            <code class="code-hint">{"{{ key.amount }}"}</code>{" "}
            for just the number.{" "}
            <a href="/docs/templates" class="link text-xs">Full reference</a>
          </p>
          <StepForm
            key={`steps-${v}`}
            initialSteps={(r.steps ?? []).map((s) => ({
              title: s.title ?? "",
              body: s.body ?? "",
              media: [],
            }))}
          />
        </div>

        <div class="card">
          <h2 class="font-semibold mb-2">Sub-recipe References</h2>
          {/* RefForm is a server component, rendered as static HTML. We render a simple version here. */}
          <select name="refs[0][referenced_recipe_id]" class="w-full text-sm">
            <option value="">No sub-recipe</option>
            {allRecipes.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>

        <div class="flex gap-3 flex-wrap">
          <button type="submit" class="btn btn-primary">
            Create Recipe
          </button>
          <button
            type="button"
            class="btn btn-outline"
            disabled={saving.value}
            onClick={saveDraft}
          >
            {saving.value ? "Saving..." : "Save Draft"}
          </button>
          <RecipePreview />
          <ConfirmButton
            message="Discard this draft?"
            class="btn text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={discardDraft}
          >
            Discard
          </ConfirmButton>
        </div>
      </form>
    </div>
  );
}

function formDataToRecipeData(fd: FormData): Record<string, unknown> {
  const prepRaw = fd.get("prep_time") as string;
  const prepUnit = fd.get("prep_time_unit") as string;
  const cookRaw = fd.get("cook_time") as string;
  const cookUnit = fd.get("cook_time_unit") as string;

  const ingredients: Record<string, unknown>[] = [];
  let i = 0;
  while (fd.has(`ingredients[${i}][name]`)) {
    ingredients.push({
      key: fd.get(`ingredients[${i}][key]`) ?? "",
      name: fd.get(`ingredients[${i}][name]`) ?? "",
      amount: fd.get(`ingredients[${i}][amount]`) ?? "",
      unit: fd.get(`ingredients[${i}][unit]`) ?? "",
    });
    i++;
  }

  const steps: Record<string, unknown>[] = [];
  let s = 0;
  while (fd.has(`steps[${s}][title]`) || fd.has(`steps[${s}][body]`)) {
    steps.push({
      title: fd.get(`steps[${s}][title]`) ?? "",
      body: fd.get(`steps[${s}][body]`) ?? "",
    });
    s++;
  }

  return {
    title: fd.get("title") ?? "",
    description: fd.get("description") ?? "",
    quantity_type: fd.get("quantity_type") ?? "servings",
    quantity_value: Number(fd.get("quantity_value")) || 4,
    quantity_unit: fd.get("quantity_unit") ?? "servings",
    prep_time: prepRaw
      ? Math.round(parseFloat(prepRaw) * (prepUnit === "hr" ? 60 : 1))
      : null,
    cook_time: cookRaw
      ? Math.round(parseFloat(cookRaw) * (cookUnit === "hr" ? 60 : 1))
      : null,
    difficulty: (fd.get("difficulty") as string) || null,
    ingredients,
    steps,
    cover_image: null,
  };
}
