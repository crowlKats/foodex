import { useSignal } from "@preact/signals";
import { IconLoader2 } from "@tabler/icons-preact";
import { IconSparkles } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Input, InputBar, InputMultiline } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";

/** Seeds an assistant session with a generate-from-pantry request and opens it. */
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

    const parts = [
      "Look at my pantry and create a new recipe from what's on hand, " +
      "prioritizing items that expire soon.",
    ];
    const max = getMaxMinutes();
    if (max) {
      parts.push(`Total time (prep + cook) must stay under ${max} minutes.`);
    }
    if (instructions.value.trim()) {
      parts.push(`Additional instructions: ${instructions.value.trim()}`);
    }

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { text: parts.join("\n") } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Generation failed");
      globalThis.location.href = `/agent/${data.id}?start=1`;
    } catch (err) {
      error.value = (err as Error).message;
      generating.value = false;
    }
  }

  if (generating.value) {
    return (
      <div class="card">
        <div class="flex flex-col items-center justify-center py-8 gap-3">
          <IconLoader2 class="size-10 text-orange-600 animate-spin" />
          <p class="text-sm font-medium">
            Starting the assistant…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="card space-y-3">
      <h2 class="font-semibold flex items-center gap-2">
        <IconSparkles class="size-5 text-orange-600" />
        Generate Recipe from Pantry
      </h2>
      <p class="text-sm text-stone-500">
        The assistant suggests a recipe based on what you have on hand.
      </p>

      {error.value && <div class="alert-error">{error.value}</div>}

      <div>
        <label class="block text-sm font-medium mb-1">
          Max total time <span class="text-stone-400">(optional)</span>
        </label>
        <InputBar>
          <Input
            type="number"
            min="0"
            value={maxTime.value}
            placeholder="Any"
            onValueChange={(v) => maxTime.value = v}
          />
          <Select
            value={maxTimeUnit.value}
            class="w-20"
            size="xs"
            onValueChange={(v) => maxTimeUnit.value = v}
          >
            <option value="min">min</option>
            <option value="hr">hr</option>
          </Select>
        </InputBar>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">
          Additional instructions <span class="text-stone-400">(optional)</span>
        </label>
        <InputMultiline
          rows={2}
          class="w-full"
          size="sm"
          placeholder="e.g. something Italian, no spicy food, a dessert..."
          value={instructions.value}
          onValueChange={(v) => instructions.value = v}
        />
      </div>

      <Button
        type="button"
        onClick={generate}
        icon={IconSparkles}
      >
        Generate
      </Button>
    </div>
  );
}
