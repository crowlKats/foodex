import { useSignal } from "@preact/signals";
import {
  evaluateTemplate,
  formatAmount,
  scaleIngredients,
} from "../lib/template.ts";
import { computeScaleRatio } from "../lib/quantity.ts";
import type { RecipeQuantity } from "../lib/quantity.ts";
import { getCurrencySymbol } from "../lib/currencies.ts";
import { marked } from "marked";

function RecipeHtml({ html }: { html: string }) {
  return (
    <div
      class="card p-6 recipe-body"
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface RecipeStep {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
}

interface RecipeIngredient {
  key: string;
  amount: number;
  unit: string;
  name: string;
  ingredient_id?: number;
  base_cost?: number; // cost at the recipe's default quantity
  currency?: string;
}

interface RecipeTool {
  id: number;
  name: string;
  settings?: string;
  usage?: string;
}

interface RecipeRef {
  slug: string;
  title: string;
}

interface RecipeViewProps {
  steps: RecipeStep[];
  ingredients: RecipeIngredient[];
  tools?: RecipeTool[];
  refs?: RecipeRef[];
  baseQuantity: RecipeQuantity;
  slug: string;
  hasSubRecipes: boolean;
  initialHtml: string;
  recipeId: number;
  loggedIn: boolean;
}

function renderStepsClient(
  steps: RecipeStep[],
  ratio: number,
  ingredients: RecipeIngredient[],
): string {
  const scaled = scaleIngredients(ingredients, ratio);
  const vars: Record<string, number> = { ratio };
  const parts: string[] = [];

  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    const evaluated = evaluateTemplate(step.body, vars, scaled);
    const html = marked.parse(evaluated);
    if (typeof html === "string") {
      let stepHtml =
        `<h2 class="text-xl font-semibold mt-6 mb-3"><span class="text-stone-400 mr-2">${
          si + 1
        }.</span>${step.title.replace(/</g, "&lt;")}</h2>\n${html}`;
      if (step.media && step.media.length > 0) {
        stepHtml += `<div class="flex flex-wrap gap-2 mt-3">${
          step.media.map((m) =>
            `<img src="${m.url}" alt="" class="max-w-sm border-2 border-stone-300 dark:border-stone-700" />`
          ).join("")
        }</div>`;
      }
      parts.push(stepHtml);
    }
  }
  return parts.join("\n");
}

function buildQueryParams(target: RecipeQuantity): string {
  const params = new URLSearchParams();
  params.set("type", target.type);
  params.set("value", String(target.value));
  params.set("unit", target.unit);
  if (target.value2 != null) params.set("value2", String(target.value2));
  if (target.value3 != null) params.set("value3", String(target.value3));
  if (target.unit2) params.set("unit2", target.unit2);
  return params.toString();
}

export default function RecipeView(
  {
    steps,
    ingredients,
    tools,
    refs,
    baseQuantity,
    slug,
    hasSubRecipes,
    initialHtml,
    recipeId,
    loggedIn,
  }: RecipeViewProps,
) {
  const addedToList = useSignal<string | null>(null);
  const targetValue = useSignal(baseQuantity.value);
  const targetUnit = useSignal(baseQuantity.unit);
  const targetValue2 = useSignal(baseQuantity.value2 ?? baseQuantity.value);
  const targetValue3 = useSignal(baseQuantity.value3 ?? 1);
  const html = useSignal(initialHtml);
  const loading = useSignal(false);

  function getTarget(): RecipeQuantity {
    return {
      type: baseQuantity.type,
      value: targetValue.value,
      unit: targetUnit.value,
      value2: baseQuantity.type === "dimensions"
        ? targetValue2.value
        : undefined,
      value3: baseQuantity.type === "dimensions"
        ? targetValue3.value
        : undefined,
      unit2: baseQuantity.type === "dimensions"
        ? (baseQuantity.unit2 ?? "cm")
        : undefined,
    };
  }

  function update() {
    const target = getTarget();
    const ratio = computeScaleRatio(baseQuantity, target);

    html.value = renderStepsClient(steps, ratio, ingredients);

    if (hasSubRecipes) {
      loading.value = true;
      fetch(`/api/recipes/${slug}/render?${buildQueryParams(target)}`)
        .then((r) => r.json())
        .then((data: { html: string }) => {
          html.value = data.html;
        })
        .finally(() => {
          loading.value = false;
        });
    }
  }

  function renderScalingUI() {
    if (baseQuantity.type === "servings") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Servings:</label>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              class="w-8 h-8 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold cursor-pointer"
              onClick={() => {
                if (targetValue.value > 1) {
                  targetValue.value = targetValue.value - 1;
                  update();
                }
              }}
            >
              -
            </button>
            <input
              type="number"
              min="1"
              value={targetValue}
              class="w-16 text-center"
              onInput={(e) => {
                const v = parseInt((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <button
              type="button"
              class="w-8 h-8 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold cursor-pointer"
              onClick={() => {
                targetValue.value = targetValue.value + 1;
                update();
              }}
            >
              +
            </button>
            {loading.value && (
              <span class="text-xs text-stone-400 ml-2">updating...</span>
            )}
          </div>
        </div>
      );
    }

    if (baseQuantity.type === "weight") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Weight:</label>
          <div class="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min="0"
              step="any"
              value={targetValue}
              class="w-24 text-center"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <select
              value={targetUnit}
              class="w-16"
              onChange={(e) => {
                targetUnit.value = (e.target as HTMLSelectElement).value;
                update();
              }}
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
            {loading.value && (
              <span class="text-xs text-stone-400 ml-2">updating...</span>
            )}
          </div>
        </div>
      );
    }

    if (baseQuantity.type === "volume") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Volume:</label>
          <div class="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min="0"
              step="any"
              value={targetValue}
              class="w-24 text-center"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <select
              value={targetUnit}
              class="w-16"
              onChange={(e) => {
                targetUnit.value = (e.target as HTMLSelectElement).value;
                update();
              }}
            >
              <option value="ml">ml</option>
              <option value="l">l</option>
            </select>
            {loading.value && (
              <span class="text-xs text-stone-400 ml-2">updating...</span>
            )}
          </div>
        </div>
      );
    }

    if (baseQuantity.type === "dimensions") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Tray (W x L x D):</label>
          <div class="flex items-center gap-1 flex-wrap">
            <input
              type="number"
              min="1"
              step="0.5"
              value={targetValue}
              class="w-12 text-center text-xs"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs">&times;</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={targetValue2}
              class="w-12 text-center text-xs"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue2.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs">&times;</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={targetValue3}
              class="w-12 text-center text-xs"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue3.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs">cm</span>
            {loading.value && (
              <span class="text-xs text-stone-400 ml-2">updating...</span>
            )}
          </div>
        </div>
      );
    }

    return null;
  }

  function getCurrentRatio(): number {
    return computeScaleRatio(baseQuantity, getTarget());
  }

  async function addAllToShoppingList() {
    const ratio = getCurrentRatio();
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_recipe",
        recipe_id: recipeId,
        scale: ratio,
      }),
    });
    if (res.ok) {
      addedToList.value = "all";
      setTimeout(() => { addedToList.value = null; }, 2000);
    }
  }

  async function addOneToShoppingList(ing: RecipeIngredient) {
    const ratio = getCurrentRatio();
    await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_ingredient",
        ingredient_id: ing.ingredient_id ?? null,
        name: ing.name,
        amount: ing.amount != null ? ing.amount * ratio : null,
        unit: ing.unit || null,
        recipe_id: recipeId,
      }),
    });
    addedToList.value = ing.key;
    setTimeout(() => { addedToList.value = null; }, 1500);
  }

  return (
    <div class="grid gap-6 lg:grid-cols-4">
      <div class="lg:col-span-1 space-y-4">
        <div class="card">
          {renderScalingUI()}
        </div>
        {ingredients.length > 0 && (
          <div class="card">
            <div class="flex items-center justify-between mb-2">
              <h2 class="font-semibold">Ingredients</h2>
              {loggedIn && (
                <button
                  type="button"
                  class="text-xs text-orange-600 hover:underline cursor-pointer"
                  onClick={addAllToShoppingList}
                >
                  {addedToList.value === "all" ? "Added!" : "Add all to list"}
                </button>
              )}
            </div>
            <ul class="space-y-1.5">
              {ingredients.map((ing) => {
                const ratio = getCurrentRatio();
                const scaled = ing.amount * ratio;
                const cost = ing.base_cost != null
                  ? ing.base_cost * ratio
                  : undefined;
                return (
                  <li
                    key={ing.key || ing.name}
                    class="text-sm flex justify-between items-baseline gap-2"
                  >
                    <span class="flex items-baseline gap-1">
                      {loggedIn && (
                        <button
                          type="button"
                          class="text-stone-400 hover:text-orange-600 cursor-pointer text-xs leading-none"
                          title="Add to shopping list"
                          onClick={() => addOneToShoppingList(ing)}
                        >
                          {addedToList.value === ing.key ? "\u2713" : "+"}
                        </button>
                      )}
                      <span>
                        <span class="font-medium">
                          {formatAmount(scaled, ing.unit)} {ing.unit}
                        </span>{" "}
                        {ing.ingredient_id
                          ? (
                            <a
                              href={`/ingredients/${ing.ingredient_id}`}
                              class="link"
                            >
                              {ing.name}
                            </a>
                          )
                          : <span>{ing.name}</span>}
                      </span>
                    </span>
                    {cost != null && (
                      <span class="text-stone-400 text-xs whitespace-nowrap">
                        {getCurrencySymbol(ing.currency ?? "EUR")}
                        {cost.toFixed(2)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {(() => {
              const ratio = getCurrentRatio();
              const total = ingredients.reduce((sum, ing) => {
                if (ing.base_cost == null) return sum;
                return sum + ing.base_cost * ratio;
              }, 0);
              const hasPrices = ingredients.some((i) => i.base_cost != null);
              if (!hasPrices) return null;
              const currency = ingredients.find((i) => i.currency)?.currency ??
                "EUR";
              return (
                <div class="mt-3 pt-2 border-t-2 border-stone-200 dark:border-stone-700 flex justify-between text-sm font-semibold">
                  <span>Estimated cost</span>
                  <span class="text-orange-600">
                    {getCurrencySymbol(currency)}
                    {total.toFixed(2)}
                  </span>
                </div>
              );
            })()}
          </div>
        )}
        {tools && tools.length > 0 && (
          <div class="card">
            <h2 class="font-semibold mb-2">Tools</h2>
            <ul class="space-y-1">
              {tools.map((t) => (
                <li key={t.id} class="text-sm">
                  <a href={`/tools/${t.id}`} class="link font-medium">
                    {t.name}
                  </a>
                  {t.settings && (
                    <span class="text-stone-500">{` (${t.settings})`}</span>
                  )}
                  {t.usage && (
                    <div class="text-stone-500 text-xs">{t.usage}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {refs && refs.length > 0 && (
          <div class="card">
            <h2 class="font-semibold mb-2">Sub-recipes</h2>
            <ul class="space-y-1">
              {refs.map((r) => (
                <li key={r.slug}>
                  <a href={`/recipes/${r.slug}`} class="link text-sm">
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div class="lg:col-span-3">
        <RecipeHtml html={html.value} />
      </div>
    </div>
  );
}
