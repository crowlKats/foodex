import { useSignal } from "@preact/signals";
import { formatAmount, formatInputValue } from "../lib/format.ts";
import type { PlanEntryWithReadiness, Suggestion } from "../lib/plan.ts";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";
import { Select } from "../components/Select.tsx";
import { Checkbox } from "../components/Checkbox.tsx";
import { IconTrash } from "@tabler/icons-preact";

interface HistoryEntry {
  id: string;
  recipe_title: string | null;
  recipe_slug: string | null;
  scale: number;
  cooked_at: string | null;
}

interface Props {
  initialEntries: PlanEntryWithReadiness[];
  history: HistoryEntry[];
  suggestions: Suggestion[];
  expiring: { name: string; expires_at: string | null }[];
}

async function planCall(body: Record<string, unknown>) {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

export default function PlanView(
  { initialEntries, history, suggestions, expiring }: Props,
) {
  const entries = useSignal<PlanEntryWithReadiness[]>(initialEntries);
  const busy = useSignal<string | null>(null);
  const message = useSignal<string | null>(null);

  async function cook(entry: PlanEntryWithReadiness) {
    busy.value = entry.id;
    const result = await planCall({ action: "cook", entry_id: entry.id });
    busy.value = null;

    if (result.ok) {
      entries.value = entries.value.filter((e) => e.id !== entry.id);
      const parts: string[] = [`Cooked ${entry.recipe_title}.`];
      if (result.produced?.name) {
        parts.push(
          `${result.produced.name} added to the pantry.`,
        );
      }
      // Say what the pantry couldn't cover rather than quietly deducting less.
      if (result.shortfalls?.length) {
        parts.push(
          `Short on: ${
            result.shortfalls.map((s: {
              name: string;
              missing: number;
              unit: string | null;
            }) =>
              `${s.name} (${formatAmount(s.missing, s.unit ?? "")}${
                s.unit ? ` ${s.unit}` : ""
              })`
            ).join(", ")
          }.`,
        );
      }
      message.value = parts.join(" ");
    }
  }

  async function remove(entry: PlanEntryWithReadiness) {
    entries.value = entries.value.filter((e) => e.id !== entry.id);
    await planCall({ action: "remove", entry_id: entry.id });
  }

  async function setScale(entry: PlanEntryWithReadiness, scale: number) {
    if (!(scale > 0)) return;
    entries.value = entries.value.map((e) =>
      e.id === entry.id ? { ...e, scale } : e
    );
    // The shopping list reads the scale, so this reshapes what to buy.
    await planCall({ action: "update", entry_id: entry.id, scale });
    globalThis.location.reload();
  }

  async function setDate(entry: PlanEntryWithReadiness, date: string) {
    entries.value = entries.value.map((e) =>
      e.id === entry.id ? { ...e, planned_for: date || null } : e
    );
    await planCall({
      action: "update",
      entry_id: entry.id,
      planned_for: date || null,
    });
  }

  async function toggleList(entry: PlanEntryWithReadiness) {
    const include = !entry.include_in_list;
    entries.value = entries.value.map((e) =>
      e.id === entry.id ? { ...e, include_in_list: include } : e
    );
    await planCall({
      action: "update",
      entry_id: entry.id,
      include_in_list: include,
    });
  }

  async function plan(recipeId: string) {
    await planCall({ action: "add", recipe_id: recipeId });
    globalThis.location.reload();
  }

  async function pick(entry: PlanEntryWithReadiness, recipeId: string) {
    if (!recipeId) return;
    busy.value = entry.id;
    const result = await planCall({
      action: "pin",
      entry_id: entry.id,
      recipe_id: recipeId,
    });
    busy.value = null;
    // The pinned recipe's ingredients land on the shopping list.
    if (result.ok) globalThis.location.reload();
  }

  async function setServings(entry: PlanEntryWithReadiness, servings: number) {
    if (!(servings > 0)) return;
    entries.value = entries.value.map((e) =>
      e.id === entry.id ? { ...e, target_servings: servings } : e
    );
    await planCall({
      action: "update",
      entry_id: entry.id,
      target_servings: servings,
    });
  }

  async function uncook(entryId: string) {
    await planCall({ action: "uncook", entry_id: entryId });
    globalThis.location.reload();
  }

  return (
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-4">
        {message.value && (
          <div class="card text-sm bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800">
            {message.value}
          </div>
        )}

        <h2 class="text-lg font-semibold">
          Planned ({entries.value.length})
        </h2>

        {entries.value.length === 0
          ? (
            <p class="text-stone-500 text-sm">
              Nothing planned. Open a recipe and hit "Plan this"; the meal shows
              up here and its missing ingredients go on the shopping list.
            </p>
          )
          : (
            <div class="space-y-2">
              {entries.value.map((entry) => (
                <div key={entry.id} class="card space-y-2">
                  <div class="flex items-start gap-3">
                    <div class="flex-1 min-w-0">
                      {entry.recipe_id
                        ? (
                          <>
                            <a
                              href={`/recipes/${entry.recipe_slug}`}
                              class="link font-medium"
                            >
                              {entry.recipe_title}
                            </a>
                            {entry.dish_slug && (
                              <a
                                href={`/dishes/${entry.dish_slug}`}
                                class="text-xs text-stone-400 ml-2 hover:text-orange-600"
                                title="Other recipes for this dish"
                              >
                                switch version
                              </a>
                            )}
                            <div class="text-xs mt-0.5">
                              {entry.ready
                                ? (
                                  <span class="text-green-600 dark:text-green-400">
                                    Everything's in the pantry
                                  </span>
                                )
                                : (
                                  <span class="text-amber-600 dark:text-amber-400">
                                    Missing {entry.missing.length} of{" "}
                                    {entry.ingredientCount}:{" "}
                                    {entry.missing.slice(0, 3).map((m) =>
                                      `${m.name}${
                                        m.needed != null
                                          ? ` (${
                                            formatAmount(m.needed, m.unit ?? "")
                                          }${m.unit ? ` ${m.unit}` : ""})`
                                          : ""
                                      }`
                                    ).join(", ")}
                                    {entry.missing.length > 3 && "…"}
                                  </span>
                                )}
                            </div>
                          </>
                        )
                        : (
                          <>
                            <a
                              href={`/dishes/${entry.dish_slug}`}
                              class="link font-medium"
                            >
                              {entry.dish_name}
                            </a>
                            <span class="text-xs text-stone-400 ml-2">
                              dish: recipe not chosen yet
                            </span>
                            <div class="text-xs mt-0.5 text-amber-600 dark:text-amber-400">
                              Pick a recipe to put its ingredients on the
                              shopping list.
                            </div>
                          </>
                        )}
                    </div>
                    {entry.recipe_id && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy.value === entry.id}
                        onClick={() => cook(entry)}
                      >
                        {busy.value === entry.id ? "Cooking..." : "Cooked it"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="danger-ghost"
                      icon={IconTrash}
                      title="Remove from the plan"
                      onClick={() =>
                        remove(entry)}
                    />
                  </div>

                  {!entry.recipe_id && entry.candidates.length > 0 && (
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <Select id={`candidate-${entry.id}`} size="xs">
                        {entry.candidates.map((c) => (
                          <option key={c.recipe_id} value={c.recipe_id}>
                            {c.title}
                            {c.own ? " (yours)" : ""} — {c.missingCount === 0
                              ? "ready to cook"
                              : `${c.missingCount} of ${c.ingredientCount} missing`}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busy.value === entry.id}
                        onClick={() => {
                          const sel = document.getElementById(
                            `candidate-${entry.id}`,
                          ) as HTMLSelectElement | null;
                          if (sel) {
                            pick(entry, sel.value);
                          }
                        }}
                      >
                        Choose
                      </Button>
                    </div>
                  )}
                  {!entry.recipe_id && entry.candidates.length === 0 && (
                    <p class="text-xs text-stone-500">
                      No visible recipe makes this dish yet.
                    </p>
                  )}

                  <div class="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                    {entry.recipe_id
                      ? (
                        <label class="flex items-center gap-1">
                          Batch
                          <Input
                            type="number"
                            min="0.25"
                            step="0.25"
                            class="w-20"
                            value={formatInputValue(entry.scale)}
                            onBlur={(e) =>
                              setScale(
                                entry,
                                parseFloat(
                                  (e.currentTarget as HTMLInputElement).value,
                                ),
                              )}
                          />
                          ×
                        </label>
                      )
                      : (
                        <label class="flex items-center gap-1">
                          Servings
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            class="w-20"
                            value={entry.target_servings != null
                              ? formatInputValue(entry.target_servings)
                              : ""}
                            onBlur={(e) =>
                              setServings(
                                entry,
                                parseFloat(
                                  (e.currentTarget as HTMLInputElement).value,
                                ),
                              )}
                          />
                        </label>
                      )}
                    <label class="flex items-center gap-1">
                      When
                      <Input
                        type="date"
                        class="w-36"
                        value={entry.planned_for ?? ""}
                        onChange={(e) =>
                          setDate(
                            entry,
                            (e.currentTarget as HTMLInputElement).value,
                          )}
                      />
                    </label>
                    {entry.recipe_id && (
                      <Checkbox
                        checked={entry.include_in_list}
                        onChange={() => toggleList(entry)}
                        label="On the shopping list"
                        labelClass="text-xs"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        {history.length > 0 && (
          <div class="pt-4">
            <h2 class="text-lg font-semibold mb-2">Recently cooked</h2>
            <div class="space-y-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  class="card flex items-center gap-3 py-2 text-sm"
                >
                  <a
                    href={`/recipes/${entry.recipe_slug}`}
                    class="link flex-1 min-w-0 truncate"
                  >
                    {entry.recipe_title}
                  </a>
                  {entry.scale !== 1 && (
                    <span class="text-xs text-stone-400">
                      {formatAmount(entry.scale)}×
                    </span>
                  )}
                  <span class="text-xs text-stone-400">
                    {entry.cooked_at?.slice(0, 10)}
                  </span>
                  <button
                    type="button"
                    class="text-xs text-stone-400 hover:text-orange-600 cursor-pointer"
                    title="Put the ingredients back in the pantry"
                    onClick={() => uncook(entry.id)}
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div class="lg:col-span-1 space-y-4">
        {expiring.length > 0 && (
          <div class="card">
            <h2 class="font-semibold mb-2 text-amber-600 dark:text-amber-400">
              Use these up
            </h2>
            <ul class="text-sm space-y-0.5">
              {expiring.map((item) => (
                <li key={item.name} class="flex justify-between gap-2">
                  <span class="truncate">{item.name}</span>
                  <span class="text-xs text-stone-400 shrink-0">
                    {item.expires_at}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div class="card">
          <h2 class="font-semibold mb-2">Cook next</h2>
          {suggestions.length === 0
            ? (
              <p class="text-sm text-stone-500">
                Add a few things to the pantry and suggestions show up here.
              </p>
            )
            : (
              <ul class="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.recipe_id} class="text-sm">
                    <div class="flex items-start gap-2">
                      <div class="flex-1 min-w-0">
                        <a href={`/recipes/${s.slug}`} class="link font-medium">
                          {s.title}
                        </a>
                        <div class="text-xs text-stone-500">
                          {s.uses.length > 0
                            ? `Uses up ${s.uses.join(", ")}`
                            : s.missingCount === 0
                            ? "You have everything"
                            : `${s.missingCount} ingredient${
                              s.missingCount === 1 ? "" : "s"
                            } missing`}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => plan(s.recipe_id)}
                      >
                        Plan
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}
