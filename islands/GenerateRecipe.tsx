import { useSignal } from "@preact/signals";
import TbLoader2 from "tb-icons/TbLoader2";
import TbSparkles from "tb-icons/TbSparkles";

export default function GenerateRecipe() {
  const maxTime = useSignal("");
  const maxTimeUnit = useSignal("min");
  const instructions = useSignal("");
  const generating = useSignal(false);
  const error = useSignal<string | null>(null);

  function getMaxMinutes(): number | null {
    const v = parseFloat(maxTime.value);
    if (!v || v <= 0) return null;
    return Math.round(v * (maxTimeUnit.value === "hr" ? 60 : 1));
  }

  async function generate() {
    generating.value = true;
    error.value = null;

    try {
      const res = await fetch("/api/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_minutes: getMaxMinutes(),
          instructions: instructions.value.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      // Create draft and redirect to editor
      const draftRes = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_data: data.recipe,
          ai_messages: [{
            role: "assistant",
            content: JSON.stringify(data.recipe),
            thinking: data.thinking ?? undefined,
          }],
          ai_thinking: data.thinking ?? null,
          source: "generate",
        }),
      });
      const draft = await draftRes.json();
      globalThis.location.href = `/recipes/drafts/${draft.id}`;
    } catch (err) {
      error.value = (err as Error).message;
      generating.value = false;
    }
  }

  if (generating.value) {
    return (
      <div class="card">
        <div class="flex flex-col items-center justify-center py-8 gap-3">
          <TbLoader2 class="size-10 text-orange-600 animate-spin" />
          <p class="text-sm font-medium">
            Generating recipe from your pantry...
          </p>
          <p class="text-xs text-stone-500">This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="card space-y-3">
      <h2 class="font-semibold flex items-center gap-2">
        <TbSparkles class="size-5 text-orange-600" />
        Generate Recipe from Pantry
      </h2>
      <p class="text-sm text-stone-500">
        AI will suggest a recipe based on what you have on hand.
      </p>

      {error.value && <div class="alert-error">{error.value}</div>}

      <div>
        <label class="block text-sm font-medium mb-1">
          Max total time <span class="text-stone-400">(optional)</span>
        </label>
        <div class="flex">
          <input
            type="number"
            min="0"
            value={maxTime.value}
            placeholder="Any"
            class="flex-1"
            onInput={(e) => {
              maxTime.value = (e.target as HTMLInputElement).value;
            }}
          />
          <select
            value={maxTimeUnit.value}
            class="w-20 text-xs -ml-0.5"
            onChange={(e) => {
              maxTimeUnit.value = (e.target as HTMLSelectElement).value;
            }}
          >
            <option value="min">min</option>
            <option value="hr">hr</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">
          Additional instructions <span class="text-stone-400">(optional)</span>
        </label>
        <textarea
          rows={2}
          class="w-full text-sm"
          placeholder="e.g. something Italian, no spicy food, a dessert..."
          value={instructions.value}
          onInput={(e) => {
            instructions.value = (e.target as HTMLTextAreaElement).value;
          }}
        />
      </div>

      <button
        type="button"
        class="btn btn-primary flex items-center gap-2"
        onClick={generate}
      >
        <TbSparkles class="size-4" />
        Generate
      </button>
    </div>
  );
}
