import { useSignal } from "@preact/signals";
import { formatAmount } from "../lib/format.ts";
import { formatQuantity } from "../lib/quantity.ts";
import type { RecipeQuantity } from "../lib/quantity.ts";
import { Input } from "../components/Input.tsx";

export interface CompareRecipe {
  id: string;
  title: string;
  slug: string;
  quantity_type: string;
  quantity_value: number;
  quantity_unit: string;
}

export interface CompareCell {
  amount: number | null;
  unit: string | null;
}

export interface CompareRow {
  name: string;
  /** One cell per recipe, aligned with the recipes array; null = not used. */
  cells: (CompareCell | null)[];
}

/**
 * Side-by-side ingredient comparison across a dish's versions. By default
 * amounts are each recipe's own batch size; normalizing rescales every
 * servings-based recipe to a common serving count so quantities compare
 * like-for-like. Recipes measured by weight/volume/dimensions can't be
 * rescaled by servings and stay as written, marked as such.
 */
export default function DishCompare(
  { recipes, rows }: { recipes: CompareRecipe[]; rows: CompareRow[] },
) {
  const normalize = useSignal(false);
  const servings = useSignal("4");

  const target = parseFloat(servings.value);
  const active = normalize.value && target > 0;

  /** Per-recipe multiplier; null = can't scale this column by servings. */
  const factors = recipes.map((r) => {
    if (!active) return 1;
    if (r.quantity_type !== "servings") return null;
    const base = Number(r.quantity_value) || 4;
    return target / base;
  });

  return (
    <div>
      <div class="flex items-center gap-3 mb-3 flex-wrap">
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            class="size-4 accent-orange-600"
            checked={normalize.value}
            onChange={() => normalize.value = !normalize.value}
          />
          Normalize to
        </label>
        <Input
          type="number"
          min="1"
          step="1"
          class="w-16"
          value={servings.value}
          onInput={(e) =>
            servings.value = (e.currentTarget as HTMLInputElement).value}
        />
        <span class="text-sm text-stone-500">servings</span>
      </div>
      <p class="text-xs text-stone-400 mb-3">
        {active
          ? `Amounts rescaled to ${formatAmount(target)} servings per version.`
          : "Amounts are each recipe's own batch size; check the yield row before comparing quantities directly."}
      </p>
      <div class="overflow-x-auto">
        <table class="text-sm w-full border-collapse">
          <thead>
            <tr>
              <th class="text-left font-medium p-2 border-b-2 border-stone-300 dark:border-stone-700">
                Ingredient
              </th>
              {recipes.map((r, i) => (
                <th
                  key={r.id}
                  class="text-left font-medium p-2 border-b-2 border-stone-300 dark:border-stone-700"
                >
                  <a href={`/recipes/${r.slug}`} class="link">{r.title}</a>
                  <div class="text-xs font-normal text-stone-400">
                    {formatQuantity({
                      type: (r.quantity_type ||
                        "servings") as RecipeQuantity["type"],
                      value: r.quantity_value ?? 4,
                      unit: r.quantity_unit || "servings",
                    })}
                    {active && factors[i] == null && (
                      <span class="text-amber-600 dark:text-amber-400">
                        {" "}· as written
                      </span>
                    )}
                    {active && factors[i] != null && factors[i] !== 1 && (
                      <span>{` · ×${formatAmount(factors[i]!)}`}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                class="border-b border-stone-200 dark:border-stone-800"
              >
                <td class="p-2">{row.name}</td>
                {row.cells.map((cell, i) => {
                  if (cell == null) {
                    return (
                      <td
                        key={i}
                        class="p-2 text-stone-300 dark:text-stone-700"
                      >
                        —
                      </td>
                    );
                  }
                  if (cell.amount == null) {
                    return <td key={i} class="p-2">✓</td>;
                  }
                  const factor = factors[i] ?? 1;
                  return (
                    <td key={i} class="p-2">
                      {formatAmount(cell.amount * factor, cell.unit ?? "")}
                      {cell.unit ? ` ${cell.unit}` : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
