import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { evaluateTemplate, scaleIngredients } from "../lib/template.ts";
import {
  formatAmount,
  formatCurrency,
  formatInputValue,
} from "../lib/format.ts";
import { computeScaleRatio } from "../lib/quantity.ts";
import type { RecipeQuantity } from "../lib/quantity.ts";
import { getCurrencySymbol } from "../lib/currencies.ts";
import { convertAmount } from "../lib/unit-convert.ts";
import { replaceTimers } from "../lib/timer.ts";
import { formatTimer } from "../lib/timer.ts";
import { toDisplayUnit } from "../lib/unit-display.ts";
import type { UnitSystem } from "../lib/unit-display.ts";
import { marked } from "marked";

marked.use({ renderer: { html: () => "" } });

function RecipeHtml({ html }: { html: string }) {
  return (
    <div
      class="card p-6 recipe-body"
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface ActiveTimer {
  id: number;
  label: string;
  totalSeconds: number;
  remaining: number;
  done: boolean;
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
  ingredient_id?: string;
  base_cost?: number; // cost at the recipe's default quantity
  currency?: string;
  density?: number | null;
}

interface RecipeTool {
  id: string;
  name: string;
  settings?: string;
  usage?: string;
}

interface RecipeRef {
  slug: string;
  title: string;
}

interface PantryItem {
  ingredient_id?: string;
  name: string;
  amount?: number;
  unit?: string;
}

interface Substitution {
  name: string;
  ratio: string;
  note: string;
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
  recipeId: string;
  recipeTitle: string;
  loggedIn: boolean;
  pantryIngredientIds?: string[];
  pantryIngredientNames?: string[];
  pantryItems?: PantryItem[];
  householdId?: string | null;
  unitSystem?: UnitSystem;
  sourceRecipes?: Record<string, { title: string; slug: string }>;
  outputIngredient?: {
    ingredient_id: string;
    name: string;
    amount: number | null;
    unit: string | null;
    expires_days: number | null;
  } | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    let evaluated = evaluateTemplate(step.body, vars, scaled);
    // Resolve step references: @step(N) → anchor link
    evaluated = evaluated.replace(/@step\((\d+)\)/g, (_m, num: string) => {
      const n = parseInt(num);
      if (n < 1 || n > steps.length) return `*unknown step: ${num}*`;
      const title = steps[n - 1].title;
      const label = title ? `step ${n} (${title})` : `step ${n}`;
      return `[${label}](#step-${n})`;
    });
    const parsed = marked.parse(evaluated);
    const html = typeof parsed === "string" ? replaceTimers(parsed) : parsed;
    if (typeof html === "string") {
      let stepHtml = `<h2 id="step-${
        si + 1
      }" class="text-xl font-semibold mt-6 mb-3"><span class="text-stone-400 mr-2">${
        si + 1
      }.</span>${escapeHtml(step.title)}</h2>\n${html}`;
      if (step.media && step.media.length > 0) {
        stepHtml += `<div class="flex flex-wrap gap-2 mt-3">${
          step.media.map((m) =>
            `<img src="${
              escapeHtml(m.url)
            }" alt="" class="max-w-sm border-2 border-stone-300 dark:border-stone-700" />`
          ).join("")
        }</div>`;
      }
      parts.push(stepHtml);
    }
  }
  return parts.join("\n");
}

function renderSingleStepHtml(
  steps: RecipeStep[],
  index: number,
  ratio: number,
  ingredients: RecipeIngredient[],
): string {
  const scaled = scaleIngredients(ingredients, ratio);
  const vars: Record<string, number> = { ratio };
  const step = steps[index];
  let evaluated = evaluateTemplate(step.body, vars, scaled);
  evaluated = evaluated.replace(/@step\((\d+)\)/g, (_m, num: string) => {
    const n = parseInt(num);
    if (n < 1 || n > steps.length) return `*unknown step: ${num}*`;
    const title = steps[n - 1].title;
    const label = title ? `step ${n} (${title})` : `step ${n}`;
    return `**${label}**`;
  });
  const parsed = marked.parse(evaluated);
  const html = typeof parsed === "string" ? replaceTimers(parsed) : parsed;
  if (typeof html === "string") {
    let stepHtml = html;
    if (step.media && step.media.length > 0) {
      stepHtml += `<div class="flex flex-wrap gap-3 mt-4 justify-center">${
        step.media.map((m) =>
          `<img src="${
            escapeHtml(m.url)
          }" alt="" class="max-h-48 border-2 border-stone-300 dark:border-stone-700" />`
        ).join("")
      }</div>`;
    }
    return stepHtml;
  }
  return "";
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
    recipeTitle,
    loggedIn,
    pantryIngredientIds,
    pantryIngredientNames,
    pantryItems: pantryItemsProp,
    householdId,
    unitSystem: unitSystemProp,
    sourceRecipes,
    outputIngredient,
  }: RecipeViewProps,
) {
  const unitSystem = unitSystemProp ?? "metric";
  const pantryIdSet = new Set(pantryIngredientIds ?? []);
  const pantryNameSet = new Set(
    (pantryIngredientNames ?? []).map((n) => n.toLowerCase()),
  );
  const pantryItems = pantryItemsProp ?? [];

  /** Format a scaled ingredient amount + unit for the user's preferred unit system. */
  function displayUnit(
    amount: number,
    unit: string,
    density?: number | null,
  ): { text: string; unit: string } {
    const d = toDisplayUnit(amount, unit, unitSystem, density);
    return { text: formatAmount(d.amount, d.unit), unit: d.unit };
  }

  function isInPantry(ing: RecipeIngredient): boolean {
    if (ing.ingredient_id && pantryIdSet.has(ing.ingredient_id)) return true;
    if (pantryNameSet.has(ing.name.toLowerCase())) return true;
    return false;
  }

  function findMatchingPantryItems(ing: RecipeIngredient): PantryItem[] {
    if (ing.ingredient_id) {
      const byId = pantryItems.filter((p) =>
        p.ingredient_id === ing.ingredient_id
      );
      if (byId.length > 0) return byId;
    }
    return pantryItems.filter((p) => p.name === ing.name.toLowerCase());
  }

  /** Returns the amount still needed after subtracting pantry stock. null = no amount tracking. */
  function neededAmount(ing: RecipeIngredient, ratio: number): number | null {
    if (ing.amount == null) return null;
    const scaled = ing.amount * ratio;
    const matches = findMatchingPantryItems(ing);
    if (matches.length === 0) return scaled;

    const ingUnit = ing.unit || "";
    let totalPantryInIngUnit = 0;
    for (const pantry of matches) {
      if (pantry.amount == null) continue;
      const pantryUnit = pantry.unit || "";
      if (ingUnit !== pantryUnit) {
        const converted = convertAmount(
          pantry.amount,
          pantryUnit,
          ingUnit,
          ing.density,
        );
        if (converted != null) totalPantryInIngUnit += converted;
      } else {
        totalPantryInIngUnit += pantry.amount;
      }
    }

    if (totalPantryInIngUnit === 0) return scaled;
    const needed = scaled - totalPantryInIngUnit;
    return needed > 0 ? needed : 0;
  }
  const addedToList = useSignal<string | null>(null);
  const subsOpen = useSignal<string | null>(null);
  const subsLoading = useSignal(false);
  const subsCache = useSignal<Record<string, Substitution[]>>({});
  const subsError = useSignal<string | null>(null);
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
              value={formatInputValue(targetValue.value)}
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
              value={formatInputValue(targetValue.value)}
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
              value={formatInputValue(targetValue.value)}
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
          <div class="flex items-center gap-1 flex-nowrap">
            <input
              type="number"
              min="1"
              step="0.5"
              value={formatInputValue(targetValue.value)}
              class="w-12 text-center text-xs grow"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs select-none">&times;</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={formatInputValue(targetValue2.value)}
              class="w-12 text-center text-xs grow"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue2.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs select-none">&times;</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={formatInputValue(targetValue3.value)}
              class="w-12 text-center text-xs grow"
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (v > 0) {
                  targetValue3.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs select-none">cm</span>
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
    // Build list of items with pantry-adjusted amounts
    const items = ingredients
      .map((ing) => {
        const needed = neededAmount(ing, ratio);
        if (needed === 0) return null; // fully covered by pantry
        return {
          ingredient_id: ing.ingredient_id ?? null,
          name: ing.name,
          amount: needed,
          unit: ing.unit || null,
        };
      })
      .filter((x) => x != null);

    if (items.length === 0) {
      addedToList.value = "all";
      setTimeout(() => {
        addedToList.value = null;
      }, 2000);
      return;
    }

    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_recipe",
        recipe_id: recipeId,
        items,
      }),
    });
    if (res.ok) {
      addedToList.value = "all";
      setTimeout(() => {
        addedToList.value = null;
      }, 2000);
    }
  }

  async function addOneToShoppingList(ing: RecipeIngredient) {
    const ratio = getCurrentRatio();
    const needed = neededAmount(ing, ratio);
    if (needed === 0) {
      addedToList.value = ing.key;
      setTimeout(() => {
        addedToList.value = null;
      }, 1500);
      return;
    }
    await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_ingredient",
        ingredient_id: ing.ingredient_id ?? null,
        name: ing.name,
        amount: needed,
        unit: ing.unit || null,
        recipe_id: recipeId,
      }),
    });
    addedToList.value = ing.key;
    setTimeout(() => {
      addedToList.value = null;
    }, 1500);
  }

  async function fetchSubstitutions(ing: RecipeIngredient) {
    const key = ing.key || ing.name;
    if (subsOpen.value === key) {
      subsOpen.value = null;
      return;
    }
    subsOpen.value = key;
    if (subsCache.value[key]) return;

    subsLoading.value = true;
    subsError.value = null;
    try {
      const res = await fetch("/api/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredient: ing.name,
          recipe_title: recipeTitle,
          all_ingredients: ingredients.map((i) => i.name),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch substitutions");
      }
      const data = await res.json();
      subsCache.value = { ...subsCache.value, [key]: data.substitutions };
    } catch (err) {
      subsError.value = (err as Error).message;
    } finally {
      subsLoading.value = false;
    }
  }

  // ── Timers ──
  const timers = useSignal<ActiveTimer[]>([]);
  const timerIdCounter = useRef(0);
  const alarmIntervals = useRef<Map<number, number>>(new Map());
  const stepsRef = useRef<HTMLDivElement>(null);

  function playAlarmBeep() {
    try {
      const ctx = new AudioContext();
      const t = ctx.currentTime;
      const beep = (freq: number, start: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, t + start);
        gain.gain.linearRampToValueAtTime(0, t + start + 0.1);
        osc.start(t + start);
        osc.stop(t + start + 0.1);
      };
      // Three rapid beeps at ascending pitch
      beep(880, 0);
      beep(1100, 0.13);
      beep(1320, 0.26);
    } catch {
      // AudioContext not available
    }
  }

  function startAlarm(id: number) {
    playAlarmBeep();
    const intervalId = setInterval(playAlarmBeep, 800) as unknown as number;
    alarmIntervals.current.set(id, intervalId);
  }

  function stopAlarm(id: number) {
    const intervalId = alarmIntervals.current.get(id);
    if (intervalId != null) {
      clearInterval(intervalId);
      alarmIntervals.current.delete(id);
    }
  }

  function startTimer(seconds: number, label: string) {
    const id = ++timerIdCounter.current;
    timers.value = [
      ...timers.value,
      { id, label, totalSeconds: seconds, remaining: seconds, done: false },
    ];
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function dismissTimer(id: number) {
    stopAlarm(id);
    timers.value = timers.value.filter((t) => t.id !== id);
  }

  // Tick active timers every second — stable interval that survives re-renders
  useEffect(() => {
    const interval = setInterval(() => {
      if (timers.value.length === 0) return;
      let changed = false;
      const next = timers.value.map((t) => {
        if (t.done || t.remaining <= 0) return t;
        changed = true;
        const remaining = t.remaining - 1;
        if (remaining <= 0) {
          startAlarm(t.id);
          if (Notification.permission === "granted") {
            new Notification("Timer done!", {
              body: `${t.label} timer is up`,
              tag: `timer-${t.id}`,
            });
          }
          return { ...t, remaining: 0, done: true };
        }
        return { ...t, remaining };
      });
      if (changed) timers.value = next;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Event delegation for timer buttons in rendered HTML
  useEffect(() => {
    const el = stepsRef.current;
    if (!el) return;
    function handleClick(e: Event) {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        ".recipe-timer-btn",
      );
      if (!btn) return;
      const seconds = parseInt(btn.dataset.seconds || "0");
      const label = btn.dataset.label || "Timer";
      if (seconds > 0) startTimer(seconds, label);
    }
    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  });

  // ── Cooking Mode ──
  const cookingMode = useSignal(false);
  const cookingStep = useSignal(0);
  const cookingRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  function getCookingStepHtml(): string {
    const ratio = getCurrentRatio();
    return renderSingleStepHtml(steps, cookingStep.value, ratio, ingredients);
  }

  function enterCookingMode() {
    cookingMode.value = true;
    cookingStep.value = 0;
    // Request wake lock
    if ("wakeLock" in navigator) {
      (navigator as Navigator & {
        wakeLock: { request: (type: string) => Promise<WakeLockSentinel> };
      })
        .wakeLock.request("screen")
        .then((lock: WakeLockSentinel) => {
          wakeLockRef.current = lock;
        })
        .catch(() => {});
    }
  }

  function exitCookingMode() {
    cookingMode.value = false;
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }

  function cookingNext() {
    if (cookingStep.value < steps.length - 1) {
      cookingStep.value = cookingStep.value + 1;
    }
  }

  function cookingPrev() {
    if (cookingStep.value > 0) {
      cookingStep.value = cookingStep.value - 1;
    }
  }

  // Keyboard navigation for cooking mode
  useEffect(() => {
    if (!cookingMode.value) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        cookingNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        cookingPrev();
      } else if (e.key === "Escape") {
        exitCookingMode();
      }
    }
    globalThis.addEventListener("keydown", handleKey);
    return () => globalThis.removeEventListener("keydown", handleKey);
  });

  // Touch/swipe navigation for cooking mode
  useEffect(() => {
    const el = cookingRef.current;
    if (!el || !cookingMode.value) return;
    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0) cookingNext();
      else cookingPrev();
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  });

  // Event delegation for timer buttons inside cooking mode
  useEffect(() => {
    const el = cookingRef.current;
    if (!el || !cookingMode.value) return;
    function handleClick(e: Event) {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
        ".recipe-timer-btn",
      );
      if (!btn) return;
      const seconds = parseInt(btn.dataset.seconds || "0");
      const label = btn.dataset.label || "Timer";
      if (seconds > 0) startTimer(seconds, label);
    }
    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  });

  const cookedStatus = useSignal<"idle" | "loading" | "done">("idle");

  async function markCooked() {
    if (!householdId) return;
    cookedStatus.value = "loading";
    const ratio = getCurrentRatio();
    const items = ingredients
      .filter((ing) => ing.amount != null)
      .map((ing) => ({
        ingredient_id: ing.ingredient_id ?? null,
        name: ing.name,
        amount: ing.amount * ratio,
        unit: ing.unit || null,
      }));

    await fetch("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deduct_recipe",
        household_id: householdId,
        items,
      }),
    });

    // Add output ingredient to pantry if recipe produces one
    if (outputIngredient?.ingredient_id) {
      const outputAmount = outputIngredient.amount != null
        ? outputIngredient.amount * ratio
        : null;
      const expiresAt = outputIngredient.expires_days != null
        ? new Date(
          Date.now() + outputIngredient.expires_days * 24 * 60 * 60 * 1000,
        ).toISOString()
        : null;
      await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          ingredient_id: outputIngredient.ingredient_id,
          name: outputIngredient.name,
          amount: outputAmount,
          unit: outputIngredient.unit,
          expires_at: expiresAt,
        }),
      });
    }

    cookedStatus.value = "done";
    setTimeout(() => {
      cookedStatus.value = "idle";
    }, 2000);
  }

  return (
    <div class="recipe-print-grid grid gap-6 lg:grid-cols-4">
      <div class="recipe-print-sidebar lg:col-span-1 space-y-4">
        <div class="card print-hidden">
          {renderScalingUI()}
          {steps.length > 0 && (
            <div class="flex gap-2 mt-3">
              <button
                type="button"
                class="btn btn-primary flex-1"
                onClick={enterCookingMode}
              >
                Start Cooking
              </button>
              <button
                type="button"
                class="btn btn-outline"
                onClick={() => globalThis.print()}
                title="Print recipe"
              >
                Print
              </button>
            </div>
          )}
          {loggedIn && householdId && (
            <button
              type="button"
              class="btn btn-outline w-full mt-2"
              disabled={cookedStatus.value === "loading"}
              onClick={markCooked}
            >
              {cookedStatus.value === "done"
                ? "Deducted from pantry!"
                : cookedStatus.value === "loading"
                ? "Updating..."
                : "I cooked this"}
            </button>
          )}
        </div>
        {ingredients.length > 0 && (
          <div class="card">
            {pantryIdSet.size + pantryNameSet.size > 0 && (() => {
              const inPantry = ingredients.filter(isInPantry).length;
              const total = ingredients.length;
              const allAvailable = inPantry === total;
              return (
                <div
                  class={`text-xs px-2 py-1.5 mb-3 rounded ${
                    allAvailable
                      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {allAvailable
                    ? "All ingredients in pantry!"
                    : `${inPantry}/${total} ingredients in pantry`}
                </div>
              );
            })()}
            <h2 class="font-semibold mb-2">Ingredients</h2>
            <ul class="space-y-1.5">
              {ingredients.map((ing) => {
                const ratio = getCurrentRatio();
                const scaled = ing.amount * ratio;
                const cost = ing.base_cost != null
                  ? ing.base_cost * ratio
                  : undefined;
                const ingKey = ing.key || ing.name;
                const isSubsOpen = subsOpen.value === ingKey;
                const subs = subsCache.value[ingKey];
                return (
                  <li
                    key={ingKey}
                    class="text-sm"
                  >
                    <div class="flex justify-between items-baseline gap-2">
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
                        {isInPantry(ing) && (
                          <span
                            class="text-green-600 dark:text-green-400 text-xs leading-none"
                            title="In pantry"
                          >
                            &#x25cf;
                          </span>
                        )}
                        <span>
                          {(() => {
                            const d = displayUnit(
                              scaled,
                              ing.unit,
                              ing.density,
                            );
                            return (
                              <span class="font-medium">
                                {d.text} {d.unit}
                              </span>
                            );
                          })()} {ing.ingredient_id
                            ? (
                              <a
                                href={`/ingredients/${ing.ingredient_id}`}
                                class="link"
                              >
                                {ing.name}
                              </a>
                            )
                            : <span>{ing.name}</span>}
                          {ing.ingredient_id &&
                            sourceRecipes?.[ing.ingredient_id] && (
                            <a
                              href={`/recipes/${
                                sourceRecipes[ing.ingredient_id].slug
                              }`}
                              class="link text-xs ml-1"
                              title={`Recipe: ${
                                sourceRecipes[ing.ingredient_id].title
                              }`}
                            >
                              (recipe)
                            </a>
                          )}
                        </span>
                      </span>
                      <span class="flex items-baseline gap-2">
                        {cost != null && (
                          <span class="text-stone-400 text-xs whitespace-nowrap">
                            {getCurrencySymbol(ing.currency ?? "EUR")}
                            {formatCurrency(cost)}
                          </span>
                        )}
                        {loggedIn && (
                          <button
                            type="button"
                            class={`text-xs cursor-pointer leading-none ${
                              isSubsOpen
                                ? "text-orange-600"
                                : "text-stone-400 hover:text-orange-600"
                            }`}
                            title="Substitution suggestions"
                            onClick={() => fetchSubstitutions(ing)}
                          >
                            &#x21c4;
                          </button>
                        )}
                      </span>
                    </div>
                    {isSubsOpen && (
                      <div class="mt-1.5 ml-4 p-2 bg-stone-50 dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-xs space-y-1.5">
                        <div class="font-medium text-stone-500">
                          Substitutions for {ing.name}
                        </div>
                        {subsLoading.value && !subs && (
                          <div class="text-stone-400">Loading...</div>
                        )}
                        {subsError.value && !subs && (
                          <div class="text-red-600">{subsError.value}</div>
                        )}
                        {subs &&
                          subs.map((sub, i) => (
                            <div
                              key={i}
                              class="border-t border-stone-200 dark:border-stone-700 pt-1.5"
                            >
                              <div class="font-medium">{sub.name}</div>
                              <div class="text-stone-500">{sub.ratio}</div>
                              <div class="text-stone-400">{sub.note}</div>
                            </div>
                          ))}
                      </div>
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
                    {formatCurrency(total)}
                  </span>
                </div>
              );
            })()}
            {loggedIn && (
              <button
                type="button"
                class="btn btn-outline w-full mt-3 text-xs"
                onClick={addAllToShoppingList}
              >
                {addedToList.value === "all"
                  ? "Added!"
                  : "Shop missing"}
              </button>
            )}
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
      <div class="lg:col-span-3" ref={stepsRef}>
        <RecipeHtml html={html.value} />
      </div>
      {timers.value.length > 0 && (
        <div
          class={`fixed bottom-4 right-4 flex flex-col gap-2 max-w-xs ${
            cookingMode.value ? "z-[110]" : "z-50"
          }`}
        >
          {timers.value.map((t) => (
            <div
              key={t.id}
              class={`card flex items-center gap-3 text-sm ${
                t.done
                  ? "border-orange-600 dark:border-orange-500 animate-pulse"
                  : ""
              }`}
            >
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{t.label}</div>
                <div
                  class={`text-lg font-mono ${
                    t.done
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-stone-900 dark:text-stone-100"
                  }`}
                >
                  {t.done ? "Done!" : formatTimer(t.remaining)}
                </div>
              </div>
              <button
                type="button"
                class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer text-lg leading-none"
                title="Dismiss"
                onClick={() => dismissTimer(t.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      {cookingMode.value && (
        <div class="cooking-mode" ref={cookingRef}>
          <div class="cooking-mode-header">
            <button
              type="button"
              class="cooking-mode-close"
              onClick={exitCookingMode}
              title="Exit cooking mode (Esc)"
            >
              &times;
            </button>
            <div class="cooking-mode-progress">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  class={`cooking-mode-dot ${
                    i === cookingStep.value ? "active" : ""
                  } ${i < cookingStep.value ? "done" : ""}`}
                  onClick={() => {
                    cookingStep.value = i;
                  }}
                />
              ))}
            </div>
            <div class="cooking-mode-counter">
              {cookingStep.value + 1} / {steps.length}
            </div>
          </div>
          <div class="cooking-mode-body recipe-body">
            <div class="cooking-mode-step-title">
              <span class="text-stone-400 mr-2">{cookingStep.value + 1}.</span>
              {steps[cookingStep.value].title}
            </div>
            <div
              class="cooking-mode-step-content"
              // deno-lint-ignore react-no-danger
              dangerouslySetInnerHTML={{ __html: getCookingStepHtml() }}
            />
            {ingredients.length > 0 && (
              <details class="cooking-mode-ingredients">
                <summary>Ingredients</summary>
                <ul>
                  {ingredients.map((ing) => {
                    const ratio = getCurrentRatio();
                    const scaled = ing.amount * ratio;
                    return (
                      <li key={ing.key || ing.name}>
                        {(() => {
                          const d = displayUnit(scaled, ing.unit, ing.density);
                          return (
                            <span class="font-semibold">
                              {d.text} {d.unit}
                            </span>
                          );
                        })()} {ing.name}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </div>
          <div class="cooking-mode-nav">
            <button
              type="button"
              class="cooking-mode-nav-btn"
              disabled={cookingStep.value === 0}
              onClick={cookingPrev}
            >
              Prev
            </button>
            <button
              type="button"
              class="cooking-mode-nav-btn"
              disabled={cookingStep.value === steps.length - 1}
              onClick={cookingNext}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
