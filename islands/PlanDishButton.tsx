import { useSignal } from "@preact/signals";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";

/**
 * "Plan this dish" — creates a dish-planned entry (no recipe pinned yet) and
 * jumps to the plan, where the recipe is chosen at cook time.
 */
export default function PlanDishButton({ dishId }: { dishId: string }) {
  const servings = useSignal("4");
  const busy = useSignal(false);

  async function plan() {
    busy.value = true;
    const target = parseFloat(servings.value);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        dish_id: dishId,
        ...(target > 0 ? { target_servings: target } : {}),
      }),
    });
    busy.value = false;
    if (res.ok) globalThis.location.href = "/plan";
  }

  return (
    <div class="flex items-center gap-2">
      <label class="flex items-center gap-1 text-xs text-stone-500">
        Servings
        <Input
          type="number"
          min="1"
          step="1"
          class="w-16"
          value={servings.value}
          onInput={(e) =>
            servings.value = (e.currentTarget as HTMLInputElement).value}
        />
      </label>
      <Button
        type="button"
        size="sm"
        disabled={busy.value}
        onClick={plan}
      >
        {busy.value ? "Planning..." : "Plan this dish"}
      </Button>
    </div>
  );
}
