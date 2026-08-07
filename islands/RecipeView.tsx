import { useSignal } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
import {
  formatAmount,
  formatCurrency,
  formatInputValue,
} from "../lib/format.ts";
import { computeScaleRatio, formatQuantity } from "../lib/quantity.ts";
import type { RecipeQuantity } from "../lib/quantity.ts";
import { getCurrencySymbol } from "../lib/currencies.ts";
import { computeAvailability, isAvailable } from "../lib/inventory.ts";
import { apiErrorMessage } from "../lib/api-error.ts";
import { formatTimer } from "../lib/timer.ts";
import {
  computeSectionLayout,
  type SectionInfo,
} from "../lib/step-sections.ts";
import {
  RecipeStepBody,
  RecipeSteps,
} from "../lib/recipe-template/render-steps.tsx";
import { scaleIngredients } from "../lib/recipe-template/render.tsx";
import { toDisplayUnit } from "../lib/unit-display.ts";
import type { UnitSystem } from "../lib/unit-display.ts";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";
import { IconCalendar } from "@tabler/icons-preact";

interface ActiveTimer {
  id: number;
  label: string;
  totalSeconds: number;
  remaining: number;
  done: boolean;
  /** Cooking timers get paused constantly: something boils over, the phone rings. */
  paused: boolean;
  /** Range timer (`@timer(4-6m)`): seconds left up to the upper bound,
   *  offered as a one-tap extension when the countdown fires. */
  extendSeconds?: number;
}

interface RecipeStep {
  title: string;
  body: string;
  media?: { id: string; url: string }[];
  after?: number[];
  section_id?: string | null;
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
  /** Water and the like: scales, but is never bought or counted missing. */
  always_on_hand?: boolean;
  /** Made during this recipe (browned butter): scales and renders, but is
   *  not shoppable and links to no library ingredient. */
  intermediate?: boolean;
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
  ingredient_id?: string | null;
  name: string;
  amount?: number | null;
  unit?: string | null;
  staple?: boolean;
  density?: number | null;
}

interface Substitution {
  name: string;
  ratio: string;
  note: string;
}

interface RecipeViewProps {
  steps: RecipeStep[];
  sections?: SectionInfo[];
  ingredients: RecipeIngredient[];
  tools?: RecipeTool[];
  refs?: RecipeRef[];
  /** Sub-recipes referenced via `@recipe(slug)` in step bodies. */
  recipeRefs?: { slug: string; title: string }[];
  /** Dishes referenced via `@dish(slug)` in step bodies. */
  dishRefs?: { slug: string; title: string }[];
  baseQuantity: RecipeQuantity;
  slug: string;
  recipeId: string;
  recipeTitle: string;
  loggedIn: boolean;
  pantryItems?: PantryItem[];
  householdId?: string | null;
  unitSystem?: UnitSystem;
  sourceRecipes?: Record<string, { title: string; slug: string }[]>;
}

export default function RecipeView(
  {
    steps,
    sections,
    ingredients,
    tools,
    refs,
    recipeRefs: recipeRefsList,
    dishRefs: dishRefsList,
    baseQuantity,
    slug: _slug,
    recipeId,
    recipeTitle,
    loggedIn,
    pantryItems: pantryItemsProp,
    householdId,
    unitSystem: unitSystemProp,
    sourceRecipes,
  }: RecipeViewProps,
) {
  const layout = computeSectionLayout(steps, sections);
  const unitSystem = unitSystemProp ?? "metric";
  const pantryItems = pantryItemsProp ?? [];

  // Intermediates (made while cooking) render and scale, but stay out of
  // shopping, pantry math, and the scale-by-ingredient picker.
  const shoppable = ingredients.filter((i) => !i.intermediate);
  const madeDuring = ingredients.filter((i) => i.intermediate);

  /** Format a scaled ingredient amount + unit for the user's preferred unit system. */
  function displayUnit(
    amount: number,
    unit: string,
    density?: number | null,
  ): { text: string; unit: string } {
    const d = toDisplayUnit(amount, unit, unitSystem, density);
    return { text: formatAmount(d.amount, d.unit), unit: d.unit };
  }

  /**
   * Both the "in pantry" dot and the shopping button read the same answer from
   * lib/inventory.ts. They used to disagree: the dot ignored amounts, so a
   * recipe could claim every ingredient was in the pantry while the button
   * below it worked out you were 400 g short.
   */
  function availabilityOf(ing: RecipeIngredient, ratio: number) {
    return computeAvailability(ing, pantryItems, { scale: ratio });
  }

  function isInPantry(ing: RecipeIngredient, ratio: number): boolean {
    // Water is measured, not shopped for; it never counts against you.
    if (ing.always_on_hand) return true;
    return isAvailable(availabilityOf(ing, ratio));
  }

  /** Amount still needed after pantry stock. Null when the recipe tracks none. */
  function neededAmount(ing: RecipeIngredient, ratio: number): number | null {
    return availabilityOf(ing, ratio).needed;
  }
  /** Stable per-row identity; `key` is optional on an ingredient. */
  function ingredientKey(ing: RecipeIngredient): string {
    return ing.key || ing.name;
  }

  /**
   * Transient per-row confirmation for the `+` button. Previously the only
   * feedback was the glyph changing colour, so you had to leave the page to
   * find out whether the click did anything.
   */
  const addedToList = useSignal<
    { key: string; label: string; failed?: boolean } | null
  >(null);
  /** "Plan this" / "Add missing to shopping list" confirmation. */
  const planAdded = useSignal(false);
  const subsOpen = useSignal<string | null>(null);
  const subsLoading = useSignal(false);
  const subsCache = useSignal<Record<string, Substitution[]>>({});
  const subsError = useSignal<string | null>(null);
  const targetValue = useSignal(baseQuantity.value);
  const targetUnit = useSignal(baseQuantity.unit);
  const targetValue2 = useSignal(baseQuantity.value2 ?? baseQuantity.value);
  const targetValue3 = useSignal(baseQuantity.value3 ?? 1);
  // Scale-by-ingredient mode: "I have 350 g of flour" pins the ratio to
  // entered / recipe amount. Touching the quantity controls exits the mode.
  const scaleIngKey = useSignal<string | null>(null);
  const scaleIngAmount = useSignal<number | null>(null);

  // Map of sub-recipe references (`@recipe(slug)` → resolved title), built once
  // from the server-resolved list. Used by the JSX template renderer.
  const recipeRefsMap = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    for (const r of recipeRefsList ?? []) map.set(r.slug, r);
    return map;
  }, [recipeRefsList]);

  const dishRefsMap = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    for (const d of dishRefsList ?? []) map.set(d.slug, d);
    return map;
  }, [dishRefsList]);

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

  // Re-rendering happens automatically through signals reads in the JSX:
  // changing target* signals triggers the `getCurrentRatio()` re-read in the
  // `<RecipeSteps>` render path. Called by every quantity control, so a manual
  // quantity change also takes over from scale-by-ingredient mode.
  function update() {
    scaleIngKey.value = null;
    scaleIngAmount.value = null;
  }

  /** The ingredient currently driving the scale, when the mode is active. */
  function scaleIngredient(): RecipeIngredient | null {
    if (scaleIngKey.value == null) return null;
    const ing = ingredients.find((i) => ingredientKey(i) === scaleIngKey.value);
    return ing && ing.amount > 0 ? ing : null;
  }

  /**
   * Mirror an ingredient-driven ratio into the quantity controls, so the
   * metadata line and the servings/tray inputs show the equivalent quantity,
   * and touching a control continues from there instead of jumping back.
   */
  function syncTargetsToRatio(ratio: number) {
    const r = (n: number, places: number) => {
      const f = 10 ** places;
      return Math.round(n * f) / f;
    };
    if (baseQuantity.type === "dimensions") {
      // The ratio scales the tray's area or volume; each side gets the root.
      const hasDepth = (baseQuantity.value3 ?? 0) > 0;
      const f = Math.pow(ratio, 1 / (hasDepth ? 3 : 2));
      targetValue.value = r(baseQuantity.value * f, 1);
      targetValue2.value = r((baseQuantity.value2 ?? baseQuantity.value) * f, 1);
      if (hasDepth) targetValue3.value = r(baseQuantity.value3! * f, 1);
      return;
    }
    targetUnit.value = baseQuantity.unit;
    targetValue.value = r(baseQuantity.value * ratio, 2);
  }

  function setScaleIngredient(key: string) {
    if (!key) {
      update();
      return;
    }
    const ing = ingredients.find((i) => ingredientKey(i) === key);
    if (!ing || !(ing.amount > 0)) return;
    // Seed the input with the ingredient's amount at the current scale.
    const ratio = getCurrentRatio();
    scaleIngKey.value = key;
    scaleIngAmount.value = Math.round(ing.amount * ratio * 100) / 100;
  }

  function setScaleAmount(v: number) {
    const ing = scaleIngredient();
    if (!ing || !(v > 0)) return;
    scaleIngAmount.value = v;
    syncTargetsToRatio(v / ing.amount);
  }

  function renderScalingUI() {
    if (baseQuantity.type === "servings") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Servings:</label>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="w-8 h-8 shrink-0 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold cursor-pointer"
              onClick={() => {
                if (targetValue.value > 1) {
                  targetValue.value = targetValue.value - 1;
                  update();
                }
              }}
            >
              -
            </button>
            <Input
              type="number"
              min="1"
              value={formatInputValue(targetValue.value)}
              class="flex-1 min-w-0 text-center"
              onValueChange={(s) => {
                const v = parseInt(s);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <button
              type="button"
              class="w-8 h-8 shrink-0 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold cursor-pointer"
              onClick={() => {
                targetValue.value = targetValue.value + 1;
                update();
              }}
            >
              +
            </button>
          </div>
        </div>
      );
    }

    if (baseQuantity.type === "weight") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Weight:</label>
          <div class="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="any"
              value={formatInputValue(targetValue.value)}
              class="flex-1 min-w-0 text-center"
              onValueChange={(s) => {
                const v = parseFloat(s);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <Select
              value={targetUnit}
              class="w-16 shrink-0"
              onValueChange={(v) => {
                targetUnit.value = v;
                update();
              }}
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
            </Select>
          </div>
        </div>
      );
    }

    if (baseQuantity.type === "volume") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Volume:</label>
          <div class="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="any"
              value={formatInputValue(targetValue.value)}
              class="flex-1 min-w-0 text-center"
              onValueChange={(s) => {
                const v = parseFloat(s);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <Select
              value={targetUnit}
              class="w-16 shrink-0"
              onValueChange={(v) => {
                targetUnit.value = v;
                update();
              }}
            >
              <option value="ml">ml</option>
              <option value="l">l</option>
            </Select>
          </div>
        </div>
      );
    }

    if (baseQuantity.type === "dimensions") {
      return (
        <div>
          <label class="text-sm font-medium mr-3">Tray (W x L x D):</label>
          <div class="flex items-center gap-1 flex-nowrap">
            <Input
              type="number"
              min="1"
              step="0.5"
              value={formatInputValue(targetValue.value)}
              class="w-12 text-center grow"
              size="xs"
              onValueChange={(s) => {
                const v = parseFloat(s);
                if (v > 0) {
                  targetValue.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs select-none">&times;</span>
            <Input
              type="number"
              min="1"
              step="0.5"
              value={formatInputValue(targetValue2.value)}
              class="w-12 text-center grow"
              size="xs"
              onValueChange={(s) => {
                const v = parseFloat(s);
                if (v > 0) {
                  targetValue2.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs select-none">&times;</span>
            <Input
              type="number"
              min="1"
              step="0.5"
              value={formatInputValue(targetValue3.value)}
              class="w-12 text-center grow"
              size="xs"
              onValueChange={(s) => {
                const v = parseFloat(s);
                if (v > 0) {
                  targetValue3.value = v;
                  update();
                }
              }}
            />
            <span class="text-stone-500 text-xs select-none">cm</span>
          </div>
        </div>
      );
    }

    return null;
  }

  function getCurrentRatio(): number {
    // Ingredient mode wins while active: the ratio is exact from the entered
    // amount; the target signals only mirror it for display.
    const ing = scaleIngredient();
    if (ing && (scaleIngAmount.value ?? 0) > 0) {
      return scaleIngAmount.value! / ing.amount;
    }
    return computeScaleRatio(baseQuantity, getTarget());
  }

  // The (retargeted) tray for {{ tray }} refs; only dimensions recipes.
  function getTray() {
    if (baseQuantity.type !== "dimensions") return undefined;
    return {
      value: targetValue.value,
      value2: targetValue2.value,
      value3: targetValue3.value > 0 ? targetValue3.value : undefined,
    };
  }

  /**
   * The metadata line under the title is server-rendered outside this island,
   * so it kept showing the authored servings while the scaler showed another.
   * No dependency array: it re-runs on every render, which is exactly when a
   * target signal has changed.
   */
  useEffect(() => {
    const el = document.querySelector("[data-recipe-quantity]");
    if (el) el.textContent = formatQuantity(getTarget());
  });

  /**
   * Planning the meal is what puts it on the shopping list.
   *
   * The entry stores the scale rather than a snapshot of missing amounts, so
   * the list stays correct when the pantry changes or the servings are edited.
   * The old version froze pantry-adjusted numbers that nothing could recompute.
   */
  async function addToPlan(plannedFor: string | null) {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        recipe_id: recipeId,
        scale: getCurrentRatio(),
        planned_for: plannedFor,
      }),
    });
    if (res.ok) {
      planAdded.value = true;
      planDate.value = "";
      setTimeout(() => {
        planAdded.value = false;
      }, 2500);
    }
  }

  async function addOneToShoppingList(ing: RecipeIngredient) {
    const ratio = getCurrentRatio();
    const needed = neededAmount(ing, ratio);
    const key = ingredientKey(ing);
    if (needed === 0) {
      // Already covered by the pantry: nothing to add, but say so rather than
      // leaving the click looking like it did nothing.
      addedToList.value = { key, label: "already in pantry" };
      setTimeout(() => {
        addedToList.value = null;
      }, 2500);
      return;
    }
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_demand",
        ingredient_id: ing.ingredient_id ?? undefined,
        name: ing.name,
        amount: needed,
        unit: ing.unit || null,
        note: `For ${recipeTitle}`,
      }),
    });
    addedToList.value = res.ok ? { key, label: "on your list" } : {
      key,
      label: await apiErrorMessage(res, "couldn't add"),
      failed: true,
    };
    setTimeout(() => {
      addedToList.value = null;
    }, 2500);
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

  function startTimer(seconds: number, label: string, maxSeconds?: number) {
    const id = ++timerIdCounter.current;
    timers.value = [
      ...timers.value,
      {
        id,
        label,
        totalSeconds: seconds,
        remaining: seconds,
        done: false,
        paused: false,
        extendSeconds: maxSeconds != null && maxSeconds > seconds
          ? maxSeconds - seconds
          : undefined,
      },
    ];
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  /** "4-6 min" range timer that fired at 4: run the remaining 2 minutes. */
  function extendTimer(id: number) {
    stopAlarm(id);
    timers.value = timers.value.map((t) =>
      t.id === id && t.done && t.extendSeconds
        ? {
          ...t,
          totalSeconds: t.extendSeconds,
          remaining: t.extendSeconds,
          done: false,
          paused: false,
          extendSeconds: undefined,
        }
        : t
    );
  }

  function dismissTimer(id: number) {
    stopAlarm(id);
    timers.value = timers.value.filter((t) => t.id !== id);
  }

  function toggleTimerPaused(id: number) {
    timers.value = timers.value.map((t) =>
      t.id === id && !t.done ? { ...t, paused: !t.paused } : t
    );
  }

  // Tick active timers every second: stable interval that survives re-renders
  useEffect(() => {
    const interval = setInterval(() => {
      if (timers.value.length === 0) return;
      let changed = false;
      const next = timers.value.map((t) => {
        if (t.done || t.paused || t.remaining <= 0) return t;
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

  // ── Cooking Mode ──
  const cookingMode = useSignal(false);
  const cookingStep = useSignal(0); // for linear mode
  const cookingDone = useSignal<Set<number>>(new Set()); // for graph mode
  const cookingDoneOrder = useSignal<number[]>([]); // LIFO undo history for graph mode
  const cookingFocused = useSignal<number | null>(null); // which step is expanded in graph mode
  const cookingRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const isLinearRecipe = steps.every((s, i) => {
    const after = s.after ?? [];
    if (i === 0) return after.length === 0;
    return after.length === 1 && after[0] === i - 1;
  });

  function cookingStepBody(idx: number) {
    const ratio = getCurrentRatio();
    return (
      <RecipeStepBody
        step={steps[idx]}
        steps={steps}
        sections={sections}
        tray={getTray()}
        variables={{ ratio }}
        ingredients={scaleIngredients(ingredients, ratio)}
        recipeRefs={recipeRefsMap}
        dishRefs={dishRefsMap}
        onTimerStart={startTimer}
      />
    );
  }

  /** Collapsible full ingredient list at the current scale, shown per view. */
  function cookingIngredients() {
    if (ingredients.length === 0) return null;
    const ratio = getCurrentRatio();
    return (
      <details class="cooking-mode-ingredients">
        <summary>Ingredients</summary>
        <ul>
          {ingredients.map((ing) => {
            const scaled = ing.amount * ratio;
            const d = displayUnit(scaled, ing.unit, ing.density);
            return (
              <li key={ing.key || ing.name}>
                <span class="font-semibold">
                  {d.text} {d.unit}
                </span>{" "}
                {ing.name}
              </li>
            );
          })}
        </ul>
      </details>
    );
  }

  function getCookingStepLabel(idx: number): {
    section: string | null;
    num: number;
  } {
    const sid = steps[idx].section_id ?? null;
    const sec = sid ? layout.byId.get(sid) : null;
    return { section: sec?.title ?? null, num: layout.displayNum[idx] };
  }

  /**
   * Map section index → set of global step indices in that section.
   * Lets us check section completion in O(1) per section.
   */
  const sectionStepIdxByIndex: number[][] = (sections ?? []).map(() => []);
  if (sections && sections.length > 0) {
    const sectionIdToIndex = new Map<string, number>();
    sections.forEach((s, i) => sectionIdToIndex.set(s.id, i));
    for (let i = 0; i < steps.length; i++) {
      const sid = steps[i].section_id ?? null;
      if (!sid) continue;
      const sIdx = sectionIdToIndex.get(sid);
      if (sIdx != null) sectionStepIdxByIndex[sIdx].push(i);
    }
  }

  /** Section is complete when all its steps are done. */
  function isSectionComplete(secIdx: number, done: Set<number>): boolean {
    const stepIdxs = sectionStepIdxByIndex[secIdx];
    if (!stepIdxs || stepIdxs.length === 0) return true;
    return stepIdxs.every((i) => done.has(i));
  }

  /** Get steps whose deps are all done, including section-level gating. */
  function availableSteps(): number[] {
    const done = cookingDone.value;
    const available: number[] = [];
    const sectionIdToIndex = new Map<string, number>();
    (sections ?? []).forEach((s, i) => sectionIdToIndex.set(s.id, i));
    for (let i = 0; i < steps.length; i++) {
      if (done.has(i)) continue;
      const after = steps[i].after ?? [];
      const stepDepsDone = after.length === 0 ||
        after.every((d) => done.has(d));
      if (!stepDepsDone) continue;
      // Section gating: this step's section must have all its dep sections complete
      const sid = steps[i].section_id ?? null;
      if (sid && sections) {
        const sIdx = sectionIdToIndex.get(sid);
        if (sIdx != null) {
          const secAfter = sections[sIdx].after ?? [];
          const sectionDepsDone = secAfter.every((dIdx) =>
            isSectionComplete(dIdx, done)
          );
          if (!sectionDepsDone) continue;
        }
      }
      available.push(i);
    }
    return available;
  }

  function markStepDone(idx: number) {
    if (cookingDone.value.has(idx)) return;
    const next = new Set(cookingDone.value);
    next.add(idx);
    cookingDone.value = next;
    cookingDoneOrder.value = [...cookingDoneOrder.value, idx];
  }

  function unmarkStepDone(idx: number) {
    const next = new Set(cookingDone.value);
    next.delete(idx);
    cookingDone.value = next;
    cookingDoneOrder.value = cookingDoneOrder.value.filter((i) => i !== idx);
  }

  /** Undo the most-recent done step in the same section as `columnStepIdx`. */
  function cookingPrevInSection(columnStepIdx: number) {
    const sid = steps[columnStepIdx].section_id ?? null;
    const sameSec = cookingDoneOrder.value.filter((i) =>
      (steps[i].section_id ?? null) === sid
    );
    if (sameSec.length === 0) return;
    unmarkStepDone(sameSec[sameSec.length - 1]);
  }

  function hasSectionPrev(columnStepIdx: number): boolean {
    const sid = steps[columnStepIdx].section_id ?? null;
    return cookingDoneOrder.value.some((i) =>
      (steps[i].section_id ?? null) === sid
    );
  }

  function enterCookingMode() {
    cookingMode.value = true;
    cookingStep.value = 0;
    cookingDone.value = new Set();
    cookingDoneOrder.value = [];
    cookingFocused.value = null;
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
      peekReturn.value = null;
    }
  }

  function cookingPrev() {
    if (cookingStep.value > 0) {
      cookingStep.value = cookingStep.value - 1;
      peekReturn.value = null;
    }
  }

  /**
   * Step the user was on before following a cross-reference link, so a peek at
   * "the bolognese from step 5" can be undone. Null when not peeking.
   */
  const peekReturn = useSignal<number | null>(null);

  /** `#step-3` → the index of that step, from the same map that renders them. */
  const anchorToIndex = useMemo(() => {
    const map = new Map<string, number>();
    layout.anchors.forEach((anchor, idx) => map.set(anchor, idx));
    return map;
  }, [layout]);

  /**
   * Cross-reference links are plain anchors into the recipe page underneath the
   * overlay, so in cooking mode they changed the URL and did nothing visible.
   * Here they move the carousel instead, which matters more in cooking mode
   * than on the page, since you can't just glance up at the referenced step.
   */
  function handleCookingClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement | null)?.closest?.("a");
    const href = anchor?.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    const targetIdx = anchorToIndex.get(href.slice(1));
    if (targetIdx == null) return;
    e.preventDefault();
    if (targetIdx === cookingStep.value) return;
    peekReturn.value = cookingStep.value;
    cookingStep.value = targetIdx;
  }

  // Keyboard navigation for cooking mode
  useEffect(() => {
    if (!cookingMode.value) return;
    function handleKey(e: KeyboardEvent) {
      if (isLinearRecipe) {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          cookingNext();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          cookingPrev();
        }
      } else {
        const avail = availableSteps();
        if (avail.length === 1 && (e.key === "ArrowRight" || e.key === " ")) {
          e.preventDefault();
          markStepDone(avail[0]);
        } else if (e.key === "ArrowLeft" && avail.length === 1) {
          e.preventDefault();
          cookingPrevInSection(avail[0]);
        }
      }
      if (e.key === "Escape") {
        exitCookingMode();
      }
    }
    globalThis.addEventListener("keydown", handleKey);
    return () => globalThis.removeEventListener("keydown", handleKey);
  });

  // Touch/swipe navigation for cooking mode (linear only)
  useEffect(() => {
    const el = cookingRef.current;
    if (!el || !cookingMode.value || !isLinearRecipe) return;
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

  const cookedStatus = useSignal<"idle" | "loading" | "done">("idle");
  const cookedShort = useSignal<string[]>([]);
  const planDate = useSignal("");
  const planOpen = useSignal(false);

  /**
   * Cooking is a plan entry reaching its end state, not a one-off deduction:
   * the server records it, draws the ingredients through the ledger, books
   * whatever the recipe produces, and can undo the whole thing.
   */
  async function markCooked() {
    if (!householdId) return;
    cookedStatus.value = "loading";
    cookedShort.value = [];

    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cook_now",
        recipe_id: recipeId,
        scale: getCurrentRatio(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Say so when the pantry couldn't cover it, instead of quietly
      // under-deducting and leaving the stock looking healthier than it is.
      cookedShort.value = (data.shortfalls ?? []).map((s: {
        name: string;
        missing: number;
        unit: string | null;
      }) =>
        `${s.name} (short ${formatAmount(s.missing, s.unit ?? "")}${
          s.unit ? ` ${s.unit}` : ""
        })`
      );
    }

    cookedStatus.value = "done";
    setTimeout(() => {
      cookedStatus.value = "idle";
    }, 3000);
  }

  /**
   * The last step used to dead-end on a greyed-out Next. Finishing the final
   * step is the single best moment to offer "I cooked this" (the action that
   * deducts from the pantry), and it was the one moment it wasn't offered.
   */
  function renderCookingFinish() {
    if (!loggedIn || !householdId) {
      return (
        <button
          type="button"
          class="cooking-mode-nav-btn btn-primary"
          onClick={exitCookingMode}
        >
          Done
        </button>
      );
    }
    if (cookedStatus.value === "done") {
      // The shortfall list can run to a dozen ingredients, so it goes on its
      // own line above the bar rather than into this label.
      return (
        <button
          type="button"
          class="cooking-mode-nav-btn btn-primary"
          onClick={exitCookingMode}
        >
          Deducted from your pantry. Close
        </button>
      );
    }
    return (
      <button
        type="button"
        class="cooking-mode-nav-btn btn-primary"
        disabled={cookedStatus.value === "loading"}
        onClick={async () => {
          await markCooked();
          // Leave the overlay up briefly so the shortfall summary is readable.
          setTimeout(exitCookingMode, 2500);
        }}
      >
        {cookedStatus.value === "loading" ? "Updating…" : "Done: I cooked this"}
      </button>
    );
  }

  return (
    <div class="recipe-print-grid grid gap-6 lg:grid-cols-4">
      <div class="recipe-print-sidebar lg:col-span-1 space-y-4">
        <div class="card print-hidden">
          {renderScalingUI()}
          {shoppable.some((i) => i.amount > 0) && (
            <div class="mt-3">
              <label class="text-sm font-medium">Scale by ingredient:</label>
              <Select
                value={scaleIngKey.value ?? ""}
                class="w-full mt-1"
                size="sm"
                onValueChange={setScaleIngredient}
              >
                <option value="">Choose an ingredient…</option>
                {shoppable.filter((i) => i.amount > 0).map((i) => (
                  <option key={ingredientKey(i)} value={ingredientKey(i)}>
                    {i.name}
                  </option>
                ))}
              </Select>
              {(() => {
                const ing = scaleIngredient();
                if (!ing) return null;
                return (
                  <div class="mt-2">
                    <div class="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={formatInputValue(scaleIngAmount.value)}
                        class="flex-1 min-w-0 text-center"
                        onValueChange={(s) => {
                          const v = parseFloat(s);
                          if (v > 0) setScaleAmount(v);
                        }}
                      />
                      {ing.unit && (
                        <span class="text-sm text-stone-500 shrink-0">
                          {ing.unit}
                        </span>
                      )}
                    </div>
                    <p class="text-xs text-stone-400 mt-1">
                      The whole recipe scales so {ing.name} matches this
                      amount.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
          {steps.length > 0 && (
            <div class="flex gap-2 mt-3">
              <Button
                type="button"
                class="flex-1"
                onClick={enterCookingMode}
              >
                Start Cooking
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => globalThis.print()}
                title="Print recipe"
              >
                Print
              </Button>
            </div>
          )}
          {loggedIn && householdId && (
            <>
              <div class="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  class="flex-1"
                  onClick={() => addToPlan(null)}
                >
                  {planAdded.value ? "Added to plan!" : "Plan this"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  icon={IconCalendar}
                  title="Plan it for a day"
                  onClick={() => planOpen.value = !planOpen.value}
                />
              </div>
              {planOpen.value && (
                <div class="flex gap-2 mt-2">
                  <Input
                    type="date"
                    value={planDate}
                    class="flex-1"
                    onValueChange={(v) => planDate.value = v}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!planDate.value}
                    onClick={() => {
                      addToPlan(planDate.value);
                      planOpen.value = false;
                    }}
                  >
                    Add
                  </Button>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                class="w-full mt-2"
                disabled={cookedStatus.value === "loading"}
                onClick={markCooked}
              >
                {cookedStatus.value === "done"
                  ? "Deducted from pantry!"
                  : cookedStatus.value === "loading"
                  ? "Updating..."
                  : "I cooked this"}
              </Button>
              {cookedShort.value.length > 0 && (
                <div class="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Pantry was short on: {cookedShort.value.join(", ")}
                </div>
              )}
            </>
          )}
        </div>
        {ingredients.length > 0 && (
          <div class="card">
            {pantryItems.length > 0 && (() => {
              // Counted at the current scale, with the same rule the shopping
              // button uses: double the servings and the badge reacts.
              const ratio = getCurrentRatio();
              const inPantry = shoppable.filter((ing) =>
                isInPantry(ing, ratio)
              ).length;
              const total = shoppable.length;
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
                    ? "You have everything for this"
                    : `${inPantry}/${total} ingredients in pantry`}
                </div>
              );
            })()}
            <h2 class="font-semibold mb-2">Ingredients</h2>
            <ul class="space-y-1.5">
              {shoppable.map((ing) => {
                const ratio = getCurrentRatio();
                const scaled = ing.amount * ratio;
                const cost = ing.base_cost != null
                  ? ing.base_cost * ratio
                  : undefined;
                const ingKey = ingredientKey(ing);
                const isSubsOpen = subsOpen.value === ingKey;
                const subs = subsCache.value[ingKey];
                const added = addedToList.value?.key === ingKey
                  ? addedToList.value
                  : null;
                return (
                  <li
                    key={ingKey}
                    class="text-sm"
                  >
                    <div class="flex justify-between items-baseline gap-2">
                      <span class="flex items-baseline gap-1">
                        {loggedIn && !ing.always_on_hand && (
                          <button
                            type="button"
                            class={`cursor-pointer text-xs leading-none ${
                              added
                                ? added.failed
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-green-600 dark:text-green-400"
                                : "text-stone-400 hover:text-orange-600"
                            }`}
                            title={`Add ${ing.name} to the shopping list`}
                            aria-label={`Add ${ing.name} to the shopping list`}
                            onClick={() => addOneToShoppingList(ing)}
                          >
                            {added ? "\u2713" : "+"}
                          </button>
                        )}
                        {(() => {
                          if (ing.always_on_hand) {
                            return (
                              <span
                                class="text-xs leading-none text-stone-400"
                                title="Always on hand \u2014 scales with the recipe, but never goes on the shopping list"
                              >
                                &#x25cb;
                              </span>
                            );
                          }
                          const availability = availabilityOf(ing, ratio);
                          if (!availability.present) return null;
                          const covered = isAvailable(availability);
                          return (
                            <span
                              class={`text-xs leading-none ${
                                covered
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-amber-600 dark:text-amber-400"
                              }`}
                              title={covered
                                ? availability.staple
                                  ? "Staple: always on hand"
                                  : "In pantry"
                                : `In pantry, but ${
                                  formatAmount(
                                    availability.needed ?? 0,
                                    ing.unit,
                                  )
                                }${ing.unit ? ` ${ing.unit}` : ""} short`}
                            >
                              &#x25cf;
                            </span>
                          );
                        })()}
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
                            sourceRecipes?.[ing.ingredient_id]?.map(
                              (src, i, all) => (
                                <a
                                  key={src.slug}
                                  href={`/recipes/${src.slug}`}
                                  class="link text-xs ml-1"
                                  title={`Recipe: ${src.title}`}
                                >
                                  {all.length === 1
                                    ? "(recipe)"
                                    : `(recipe ${i + 1})`}
                                </a>
                              ),
                            )}
                        </span>
                      </span>
                      <span class="flex items-baseline gap-2">
                        {added && (
                          <span
                            class={`text-xs whitespace-nowrap ${
                              added.failed
                                ? "text-red-600 dark:text-red-400"
                                : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            {added.label}
                          </span>
                        )}
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
                            title={`Suggest substitutions for ${ing.name}`}
                            aria-label={`Suggest substitutions for ${ing.name}`}
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
                        {subs && subs.length === 0 && (
                          <div class="text-stone-400 italic">
                            No good substitutions for this one.
                          </div>
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
            {madeDuring.length > 0 && (
              <div class="mt-3 pt-2 border-t-2 border-stone-200 dark:border-stone-700">
                <div
                  class="text-xs font-medium text-stone-500 mb-1"
                  title="Produced by the steps; nothing to buy or stock"
                >
                  Made while cooking
                </div>
                <ul class="space-y-1">
                  {madeDuring.map((ing) => {
                    const scaled = ing.amount * getCurrentRatio();
                    const d = displayUnit(scaled, ing.unit, ing.density);
                    return (
                      <li
                        key={ingredientKey(ing)}
                        class="text-sm text-stone-600 dark:text-stone-300"
                      >
                        <span class="font-medium">
                          {d.text} {d.unit}
                        </span>{" "}
                        {ing.name}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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
            {loggedIn && householdId && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                class="w-full mt-3"
                title="Plans this meal at the current scale. Whatever the pantry can't cover shows up on the shopping list."
                onClick={() => addToPlan(null)}
              >
                {planAdded.value
                  ? "On the plan!"
                  : "Add missing to shopping list"}
              </Button>
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
      <div class="lg:col-span-3">
        <div class="card p-6 recipe-body">
          <RecipeSteps
            steps={steps}
            sections={sections}
            variables={{ ratio: getCurrentRatio() }}
            ingredients={scaleIngredients(ingredients, getCurrentRatio())}
            tray={getTray()}
            recipeRefs={recipeRefsMap}
            dishRefs={dishRefsMap}
            onTimerStart={startTimer}
          />
        </div>
      </div>
      {timers.value.length > 0 && (
        <div
          // In cooking mode the nav bar owns the bottom of the screen, and the
          // panel used to sit on top of the Next button.
          class={`fixed right-4 flex flex-col gap-2 max-w-xs ${
            cookingMode.value ? "bottom-28 z-[110]" : "bottom-4 z-50"
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
                  {t.done
                    ? "Done!"
                    : t.paused
                    ? `${formatTimer(t.remaining)} (paused)`
                    : formatTimer(t.remaining)}
                </div>
                {t.done && t.extendSeconds != null && (
                  <button
                    type="button"
                    class="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                    title="Keep going to the range's upper bound"
                    onClick={() => extendTimer(t.id)}
                  >
                    +{formatTimer(t.extendSeconds)} more
                  </button>
                )}
              </div>
              {!t.done && (
                <button
                  type="button"
                  class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer text-lg leading-none"
                  title={t.paused ? "Resume timer" : "Pause timer"}
                  aria-label={t.paused ? "Resume timer" : "Pause timer"}
                  onClick={() => toggleTimerPaused(t.id)}
                >
                  {t.paused ? "▶" : "⏸"}
                </button>
              )}
              <button
                type="button"
                class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer text-lg leading-none"
                title="Dismiss timer"
                aria-label="Dismiss timer"
                onClick={() => dismissTimer(t.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      {cookingMode.value && isLinearRecipe && (
        <div
          class="cooking-mode cooking-mode-focus"
          ref={cookingRef}
          onClick={handleCookingClick}
        >
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
                  aria-label={`Go to step ${layout.displayNum[i]}`}
                  class={`cooking-mode-dot ${
                    i === cookingStep.value ? "active" : ""
                  } ${i < cookingStep.value ? "done" : ""}`}
                  onClick={() => {
                    cookingStep.value = i;
                    peekReturn.value = null;
                  }}
                />
              ))}
            </div>
            <div class="cooking-mode-counter">
              {cookingStep.value + 1} / {steps.length}
            </div>
          </div>
          <div class="cooking-mode-body recipe-body">
            <div class="cooking-mode-body-inner">
              {peekReturn.value != null && (
                <button
                  type="button"
                  class="mb-4 text-sm font-medium text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                  onClick={() => {
                    cookingStep.value = peekReturn.value!;
                    peekReturn.value = null;
                  }}
                >
                  ← Back to step {layout.displayNum[peekReturn.value]}
                </button>
              )}
              {(() => {
                const { section, num } = getCookingStepLabel(cookingStep.value);
                const titleText = steps[cookingStep.value].title.trim();
                return (
                  <>
                    {section && (
                      <div class="text-xs font-mono uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400 mb-1">
                        {section}
                      </div>
                    )}
                    {titleText
                      ? (
                        <div class="cooking-mode-step-title">
                          <span class="text-stone-400 mr-2">{num}.</span>
                          {titleText}
                        </div>
                      )
                      : (
                        <div class="text-sm font-semibold text-stone-400 mb-3">
                          {num}.
                        </div>
                      )}
                  </>
                );
              })()}
              <div class="cooking-mode-step-content">
                {cookingStepBody(cookingStep.value)}
              </div>
              {cookingIngredients()}
            </div>
            <div class="cooking-mode-scroll-fade" />
          </div>
          {cookedStatus.value === "done" && cookedShort.value.length > 0 && (
            <div class="shrink-0 px-4 py-2 text-sm text-amber-600 dark:text-amber-400 border-t-2 border-stone-200 dark:border-stone-700">
              Pantry was short on: {cookedShort.value.join(", ")}
            </div>
          )}
          <div class="cooking-mode-nav">
            <button
              type="button"
              class="cooking-mode-nav-btn"
              disabled={cookingStep.value === 0}
              onClick={cookingPrev}
            >
              Prev
            </button>
            {cookingStep.value === steps.length - 1
              ? renderCookingFinish()
              : (
                <button
                  type="button"
                  class="cooking-mode-nav-btn"
                  onClick={cookingNext}
                >
                  Next
                </button>
              )}
          </div>
        </div>
      )}
      {cookingMode.value && !isLinearRecipe && (() => {
        const available = availableSteps();
        const allDone = cookingDone.value.size === steps.length;

        return (
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
              {sections != null && sections.length > 0
                ? (
                  <div class="flex flex-wrap gap-1.5 flex-1 min-w-0 px-2">
                    {sections.map((sec, sIdx) => {
                      const done = cookingDone.value;
                      const locked = (sec.after ?? []).some(
                        (d) => !isSectionComplete(d, done),
                      );
                      const complete = isSectionComplete(sIdx, done);
                      const state = locked
                        ? "locked"
                        : complete
                        ? "complete"
                        : "active";
                      const cls = state === "locked"
                        ? "border-stone-300 dark:border-stone-700 text-stone-400 dark:text-stone-600"
                        : state === "complete"
                        ? "border-stone-400 dark:border-stone-500 text-stone-500 dark:text-stone-400 hover:border-orange-500 hover:text-orange-600 cursor-pointer"
                        : "border-orange-500 text-orange-600 dark:text-orange-400";
                      const onClick = state === "complete"
                        ? () => {
                          const stepIdxs = sectionStepIdxByIndex[sIdx] ?? [];
                          const last = stepIdxs[stepIdxs.length - 1];
                          if (last != null) cookingPrevInSection(last);
                        }
                        : undefined;
                      return (
                        <button
                          key={sIdx}
                          type="button"
                          disabled={state !== "complete"}
                          class={`text-[11px] font-mono uppercase tracking-[0.12em] border-2 px-2 py-0.5 ${cls} disabled:cursor-default`}
                          onClick={onClick}
                          title={state === "locked"
                            ? "Locked"
                            : state === "complete"
                            ? "Click to revisit"
                            : "Active"}
                        >
                          {state === "complete" && "✓ "}
                          {sec.title.trim() || `Section ${sIdx + 1}`}
                        </button>
                      );
                    })}
                  </div>
                )
                : (
                  <div class="cooking-mode-progress">
                    {steps.map((_, i) => (
                      <span
                        key={i}
                        class={`cooking-mode-dot ${
                          cookingDone.value.has(i) ? "done" : ""
                        } ${available.includes(i) ? "active" : ""}`}
                      />
                    ))}
                  </div>
                )}
              <div class="cooking-mode-counter">
                {cookingDone.value.size} / {steps.length}
              </div>
            </div>

            {allDone
              ? (
                <div class="cooking-mode-body">
                  <div class="cooking-mode-body-inner text-center">
                    <div class="text-4xl font-bold mb-2">Done!</div>
                    <div class="text-stone-500 mb-6">All steps completed.</div>
                    <div class="max-w-sm mx-auto flex">
                      {renderCookingFinish()}
                    </div>
                  </div>
                </div>
              )
              : (() => {
                // When sections exist, columns are per-section. When not, each
                // available step gets a column (DAG case).
                const sectionAware = sections != null && sections.length > 0;
                const done = cookingDone.value;

                interface Col {
                  key: string;
                  /** Which step this column displays (current step for active,
                   *  last step for complete), or null if locked/empty. */
                  showStepIdx: number | null;
                  /** Section idx this column represents (null for loose-step cols). */
                  sectionIdx: number | null;
                  state: "active" | "complete" | "locked";
                }

                const columns: Col[] = [];
                if (sectionAware) {
                  // Only ACTIVE sections become full columns; locked + complete
                  // are surfaced as chips in the header instead.
                  for (let sIdx = 0; sIdx < (sections ?? []).length; sIdx++) {
                    const sec = sections![sIdx];
                    const locked = (sec.after ?? []).some(
                      (d) => !isSectionComplete(d, done),
                    );
                    if (locked) continue;
                    if (isSectionComplete(sIdx, done)) continue;
                    const stepIdxs = sectionStepIdxByIndex[sIdx] ?? [];
                    let showIdx: number | null = null;
                    for (const i of stepIdxs) {
                      if (done.has(i)) continue;
                      const after = steps[i].after ?? [];
                      if (after.every((d) => done.has(d))) {
                        showIdx = i;
                        break;
                      }
                    }
                    if (showIdx == null) continue;
                    columns.push({
                      key: `sec-${sIdx}`,
                      showStepIdx: showIdx,
                      sectionIdx: sIdx,
                      state: "active",
                    });
                  }
                  // Loose steps (no section): each available one becomes its own column
                  available.forEach((idx) => {
                    if (steps[idx].section_id == null) {
                      columns.push({
                        key: `loose-${idx}`,
                        showStepIdx: idx,
                        sectionIdx: null,
                        state: "active",
                      });
                    }
                  });
                } else {
                  // No sections: one column per available step
                  available.forEach((idx) => {
                    columns.push({
                      key: `step-${idx}`,
                      showStepIdx: idx,
                      sectionIdx: null,
                      state: "active",
                    });
                  });
                }

                return (
                  // Columns side by side on desktop; stacked cards in one
                  // vertical scroll on small screens, where 3+ columns would
                  // be a few characters wide each.
                  <div class="flex-1 flex overflow-hidden max-md:flex-col max-md:overflow-y-auto">
                    {columns.map((col) => {
                      const idx = col.showStepIdx;
                      if (idx == null) return null;
                      return (
                        <div
                          key={col.key}
                          class="flex-1 flex flex-col overflow-hidden border-r-2 border-stone-200 dark:border-stone-700 last:border-r-0 max-md:flex-none max-md:overflow-visible max-md:border-r-0 max-md:border-b-2 max-md:last:border-b-0"
                        >
                          <div class="flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8 recipe-body max-md:flex-none max-md:overflow-visible">
                            {(() => {
                              const { section, num } = getCookingStepLabel(idx);
                              const titleText = steps[idx].title.trim();
                              return (
                                <>
                                  {section && (
                                    <div class="text-[11px] font-mono uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400 mb-1">
                                      {section}
                                    </div>
                                  )}
                                  {titleText
                                    ? (
                                      <div class="cooking-mode-step-title">
                                        <span class="text-stone-400 mr-2">
                                          {num}.
                                        </span>
                                        {titleText}
                                      </div>
                                    )
                                    : (
                                      <div class="text-sm font-semibold text-stone-400 mb-3">
                                        {num}.
                                      </div>
                                    )}
                                </>
                              );
                            })()}
                            <div class="cooking-mode-step-content">
                              {cookingStepBody(idx)}
                            </div>
                            {cookingIngredients()}
                            <div class="cooking-mode-scroll-fade" />
                          </div>
                          <div class="shrink-0 px-4 py-3 border-t-2 border-stone-200 dark:border-stone-700 flex gap-2">
                            <button
                              type="button"
                              class="cooking-mode-nav-btn flex-1"
                              disabled={!hasSectionPrev(idx)}
                              onClick={() => cookingPrevInSection(idx)}
                            >
                              Prev
                            </button>
                            <button
                              type="button"
                              class="cooking-mode-nav-btn btn-primary flex-1"
                              onClick={() => markStepDone(idx)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
          </div>
        );
      })()}
    </div>
  );
}
