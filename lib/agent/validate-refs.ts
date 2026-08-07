// Server-side step-body validation for staged recipes, reusing the editor's
// own diagnostics collector so the agent sees exactly what the user's form
// would flag. Errors (unknown template refs, invalid expressions, .name in
// math, bad @step refs) bounce the staging call back so the model fixes the
// recipe itself; warnings (e.g. a literal amount that quietly won't scale)
// ride along on the tool result for the model to act on.

import {
  collectStepBodyDiagnostics,
  type StepBodyContext,
} from "../step-body-diagnostics.ts";
import { ALL_UNITS } from "../units.ts";

export interface StepDiagnostics {
  errors: string[];
  warnings: string[];
}

export function stepDiagnostics(
  recipe: Record<string, unknown>,
): StepDiagnostics {
  const ingredients =
    (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .map((i) => {
        const row = i as Record<string, unknown>;
        return {
          key: String(row.key ?? ""),
          name: String(row.name ?? ""),
          unit: String(row.unit ?? ""),
          ingredient_id: String(row.ingredient_id ?? ""),
          intermediate: row.intermediate === true ||
            row.intermediate === "true",
        };
      })
      .filter((i) => i.key);
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const sections = Array.isArray(recipe.sections) ? recipe.sections : [];

  const sectionStepCounts = new Map<string, number>();
  for (const s of steps) {
    const sec = (s as Record<string, unknown>).section;
    if (typeof sec === "string" && sec) {
      sectionStepCounts.set(sec, (sectionStepCounts.get(sec) ?? 0) + 1);
    }
  }
  // Sections with no steps still exist as valid @step(section, n) targets.
  for (const s of sections) {
    const key = String((s as Record<string, unknown>).key ?? "");
    if (key && !sectionStepCounts.has(key)) sectionStepCounts.set(key, 0);
  }

  const ctx: StepBodyContext = {
    ingredientKeys: new Set(ingredients.map((i) => i.key)),
    totalSteps: steps.length,
    sectionStepCounts,
    ingredients,
  };

  const out: StepDiagnostics = { errors: [], warnings: [] };

  // The same ingredient split into per-use rows ("40 g for the sauce" and
  // "5 g for the crumb") reads as duplicate lines in the ingredient list.
  // A warning, not an error: existing recipes with duplicates must stay
  // editable, but the model is expected to merge them into one total row.
  const groupBy = (of: (g: (typeof ingredients)[number]) => string) => {
    const m = new Map<string, typeof ingredients>();
    for (const g of ingredients) {
      const k = of(g);
      if (!k) continue;
      const group = m.get(k);
      if (group) group.push(g);
      else m.set(k, [g]);
    }
    return [...m.values()].filter((g) => g.length > 1);
  };
  const warnDup = (group: typeof ingredients) => {
    out.warnings.push(
      `ingredients: "${group[0].name}" appears in ${group.length} rows (keys ${
        group.map((g) => g.key).join(", ")
      }). Merge them into ONE row holding the total amount, and write each ` +
        `partial use into the step body with arithmetic on the ref, e.g. ` +
        `{{ round(${group[0].key}.amount * 40 / 60) }} for a 40 g share of ` +
        `a 60 g total.`,
    );
  };
  const warnedKeys = new Set<string>();
  for (const group of groupBy((g) => g.name.trim().toLowerCase())) {
    warnDup(group);
    for (const g of group) warnedKeys.add(g.key);
  }
  // Same entity under different row names is the same duplication; only skip
  // groups the name pass already reported.
  for (const group of groupBy((g) => g.ingredient_id)) {
    if (group.some((g) => !warnedKeys.has(g.key))) warnDup(group);
  }

  // A key sharing no word with its name ("pasta_cooking_water" named
  // "Lemon") means one of the two got garbled; keys are derived from names.
  const tokens = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const overlaps = (a: string[], b: string[]) =>
    a.some((t1) =>
      b.some((t2) =>
        t1 === t2 ||
        (t1.length >= 3 && t2.length >= 3 &&
          (t1.startsWith(t2) || t2.startsWith(t1)))
      )
    );
  for (const g of ingredients) {
    if (!g.name.trim()) continue;
    if (!overlaps(tokens(g.key), tokens(g.name))) {
      out.warnings.push(
        `ingredients: the row keyed "${g.key}" is named "${g.name}", which ` +
          `shares no words with the key. One of the two is wrong; fix ` +
          `whichever it is (the key must be derived from the name).`,
      );
    }
  }

  // A row named like something the recipe itself produces should be an
  // intermediate, not a library-linked ingredient; as a linked row it lands
  // on shopping lists as something unbuyable and pollutes the shared corpus.
  const derivedName =
    /^(browned|burnt|caramelized|clarified|rendered|reduced|reserved|leftover)\b|cooking water$/i;
  for (const g of ingredients) {
    if (!g.intermediate && derivedName.test(g.name.trim())) {
      out.warnings.push(
        `ingredients: "${g.name}" looks like something made during the ` +
          `recipe. If it is, set "intermediate": true on the row and drop ` +
          `its "ingredient_id" instead of linking a library ingredient.`,
      );
    }
  }

  // Units are free text at the storage layer, but the editor's unit picker
  // and unit conversion only understand the known list; anything else (e.g.
  // "small") renders oddly and can be silently remapped on a later edit.
  for (const g of ingredients) {
    const unit = g.unit.trim();
    if (unit && !ALL_UNITS.includes(unit)) {
      out.warnings.push(
        `ingredients: "${g.name}" uses the unknown unit "${unit}". Use one ` +
          `of: ${ALL_UNITS.join(", ")}, or an empty unit and put the ` +
          `descriptor in the name (e.g. name "Small garlic clove", unit ` +
          `"pcs").`,
      );
    }
  }

  steps.forEach((s, i) => {
    const step = s as Record<string, unknown>;
    const body = String(step.body ?? "");
    if (!body) return;
    const { diagnostics } = collectStepBodyDiagnostics(body, ctx);
    for (const d of diagnostics) {
      const label = step.title ? `"${step.title}"` : `#${i + 1}`;
      const snippet = body.slice(d.start, d.end).replace(/\s+/g, " ");
      const line = `step ${label}, at \`${snippet}\`: ${d.message}`;
      (d.severity === "warning" ? out.warnings : out.errors).push(line);
    }
  });
  return out;
}
