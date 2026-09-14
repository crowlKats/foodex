import { bulkInsert } from "./bulk-insert.ts";
import { parseFormArray } from "./form.ts";
import { ensureIngredientIds, isIntermediate } from "./ingredient-resolve.ts";
import type { QueryFn } from "../db/mod.ts";
import {
  type AltMember,
  deriveBranches,
  deriveChoices,
} from "./recipe-choices.ts";

/**
 * Fill in `tool_id` on rows that arrived with a `new_name`, matching an
 * existing tool case-insensitively or creating one. Mutates the rows in
 * place; returns the ids of tools that were actually created.
 */
async function ensureToolIds(
  q: QueryFn,
  rows: { tool_id?: string; new_name?: string }[],
): Promise<string[]> {
  const unresolved = rows.filter(
    (r): r is { tool_id?: string; new_name: string } =>
      !r.tool_id?.trim() && !!r.new_name?.trim(),
  );
  if (unresolved.length === 0) return [];

  const norms = [
    ...new Set(unresolved.map((r) => r.new_name.trim().toLowerCase())),
  ];
  // When several tools share a name, prefer the oldest, like ingredients do.
  const existing = await q<{ id: string; norm: string }>(
    `SELECT DISTINCT ON (LOWER(TRIM(name))) LOWER(TRIM(name)) AS norm, id
     FROM tools
     WHERE LOWER(TRIM(name)) = ANY($1)
     ORDER BY LOWER(TRIM(name)), created_at, id`,
    [norms],
  );
  const byNorm = new Map(existing.rows.map((r) => [r.norm, r.id]));

  const created: string[] = [];
  for (const row of unresolved) {
    const norm = row.new_name.trim().toLowerCase();
    let id = byNorm.get(norm);
    if (!id) {
      const res = await q<{ id: string }>(
        "INSERT INTO tools (name) VALUES ($1) RETURNING id",
        [row.new_name.trim()],
      );
      id = res.rows[0].id;
      byNorm.set(norm, id);
      created.push(id);
    }
    row.tool_id = id;
  }
  return created;
}

/**
 * Save all recipe child records (choices, ingredients, tools, steps, step media, refs, tags).
 * Caller is responsible for wrapping this in a transaction.
 *
 * `householdId` lets tools created inline on the recipe form land in the
 * household's owned list, matching what creating one on /tools does.
 */
export async function saveRecipeChildren(
  q: QueryFn,
  recipeId: string,
  form: FormData,
  opts: { householdId?: string | null } = {},
): Promise<void> {
  // Alternatives. Steps and sections carry an `alt` group key; every group
  // with two or more members becomes a choice with one option per member.
  // Inserted first so the rows below can carry their option id, and so an
  // ingredient tied to a step (`for_step`) or section (`for_section`) by
  // form index can resolve to that member's option.
  const sectionEntries = parseFormArray(form, "sections");
  const stepEntriesAll = parseFormArray(form, "steps");
  const members: AltMember[] = [];
  sectionEntries.forEach((sec, i) => {
    if (sec.title?.trim() && sec.alt?.trim()) {
      members.push({
        kind: "section",
        index: i,
        title: sec.title.trim(),
        group: sec.alt.trim(),
      });
    }
  });
  stepEntriesAll.forEach((step, i) => {
    if ((step.title?.trim() || step.body?.trim()) && step.alt?.trim()) {
      members.push({
        kind: "step",
        index: i,
        title: step.title?.trim() ?? "",
        group: step.alt.trim(),
      });
    }
  });
  const derived = deriveChoices(members);
  // `alts[i][key|description]`: what each fork is about, keyed by group.
  const altDescription = new Map<string, string>();
  for (const a of parseFormArray(form, "alts")) {
    const key = a.key?.trim();
    if (key && a.description?.trim()) {
      altDescription.set(key, a.description.trim());
    }
  }
  const stepOptionId = new Map<number, string>();
  const sectionOptionId = new Map<number, string>();
  if (derived.length > 0) {
    const choiceRes = await bulkInsert(
      q,
      "recipe_choices",
      ["recipe_id", "key", "title", "description", "sort_order"],
      derived.map((c, i) => [
        recipeId,
        c.key,
        c.title,
        altDescription.get(c.key) ?? null,
        i,
      ]),
      { returning: "id" },
    );
    const optionRows: unknown[][] = [];
    const optionMembers: AltMember[] = [];
    derived.forEach((c, ci) => {
      c.options.forEach((o, oi) => {
        optionRows.push([choiceRes.rows[ci].id, o.key, o.title, oi, oi === 0]);
        optionMembers.push(o.member);
      });
    });
    const optionRes = await bulkInsert(
      q,
      "recipe_choice_options",
      ["choice_id", "key", "title", "sort_order", "is_default"],
      optionRows,
      { returning: "id" },
    );
    optionRes.rows.forEach((row, i) => {
      const m = optionMembers[i];
      (m.kind === "step" ? stepOptionId : sectionOptionId).set(
        m.index,
        row.id as string,
      );
    });
  }
  // Branch steps and sections (only reachable from one member) take that
  // member's option, so the page hides them with it.
  const afterOf = (raw: string | undefined): number[] => {
    const t = raw?.trim() ?? "";
    return t ? t.split(",").map(Number).filter((n) => !isNaN(n)) : [];
  };
  const stepBranches = deriveBranches(stepEntriesAll.map((st) => ({
    after: afterOf(st.after),
    alt: st.alt?.trim() || null,
    scope: st.section?.trim() || null,
  })));
  for (const [idx, member] of stepBranches) {
    const opt = stepOptionId.get(member);
    if (opt && !stepOptionId.has(idx)) stepOptionId.set(idx, opt);
  }
  const sectionBranches = deriveBranches(sectionEntries.map((sec) => ({
    after: afterOf(sec.after),
    alt: sec.title?.trim() ? sec.alt?.trim() || null : null,
  })));
  for (const [idx, member] of sectionBranches) {
    const opt = sectionOptionId.get(member);
    if (opt && !sectionOptionId.has(idx)) sectionOptionId.set(idx, opt);
  }

  const indexOf = (raw: string | undefined): number | null => {
    const t = raw?.trim() ?? "";
    if (t === "") return null;
    const n = parseInt(t);
    return isNaN(n) ? null : n;
  };
  /** An ingredient's option: the alternative step or section it is for. */
  const ingredientOptionId = (ing: Record<string, string>): string | null => {
    const st = indexOf(ing.for_step);
    if (st != null) return stepOptionId.get(st) ?? null;
    const sec = indexOf(ing.for_section);
    if (sec != null) return sectionOptionId.get(sec) ?? null;
    return null;
  };

  // Ingredients. Every line must link to a real ingredient entity; free-text
  // names (manual form, imports) are resolved to an existing ingredient or
  // create one here, inside the caller's transaction.
  const ingredients = parseFormArray(form, "ingredients")
    .map((ing, i) => ({ ing, i }))
    .filter(({ ing }) => ing.name?.trim());
  await ensureIngredientIds(q, ingredients.map(({ ing }) => ing));
  const ingRows = ingredients.map(({ ing, i }) => [
    recipeId,
    // Intermediates (made during the recipe) carry no entity link.
    isIntermediate(ing) ? null : ing.ingredient_id!.trim(),
    ing.key?.trim() || null,
    ing.name.trim(),
    ing.amount ? parseFloat(ing.amount) : null,
    ing.unit?.trim() || null,
    ing.note?.trim() || null,
    isIntermediate(ing),
    ingredientOptionId(ing),
    i,
  ]);

  if (ingRows.length > 0) {
    await bulkInsert(q, "recipe_ingredients", [
      "recipe_id",
      "ingredient_id",
      "key",
      "name",
      "amount",
      "unit",
      "note",
      "intermediate",
      "option_id",
      "sort_order",
    ], ingRows);
  }

  // Tools. Rows may carry a `new_name` instead of a linked tool_id (typed
  // into the recipe form); resolve those by name or create the tool here,
  // inside the caller's transaction.
  const toolEntries = parseFormArray(form, "tools");
  const createdToolIds = await ensureToolIds(q, toolEntries);
  if (opts.householdId) {
    for (const toolId of createdToolIds) {
      await q(
        "INSERT INTO household_tools (household_id, tool_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [opts.householdId, toolId],
      );
    }
  }
  const toolRows = toolEntries
    .map((t, i) => {
      if (!t.tool_id) return null;
      return [
        recipeId,
        t.tool_id,
        t.settings?.trim() || null,
        i,
      ];
    })
    .filter((r) => r != null);

  if (toolRows.length > 0) {
    await bulkInsert(q, "recipe_tools", [
      "recipe_id",
      "tool_id",
      "settings",
      "sort_order",
    ], toolRows);
  }

  // Sections (insert before steps so steps can reference section_id)
  const sectionFormIdxToDbId = new Map<number, string>();
  // afters by section form index: collected here, inserted after sections exist
  const sectionAfters: { idx: number; after: number[] }[] = [];
  if (sectionEntries.length > 0) {
    const sectionRows: unknown[][] = [];
    const sectionFormIdxs: number[] = [];
    for (let i = 0; i < sectionEntries.length; i++) {
      const sec = sectionEntries[i];
      if (!sec.title?.trim()) continue;
      sectionRows.push([
        recipeId,
        sec.key?.trim() || "",
        sec.title.trim(),
        i,
        sectionOptionId.get(i) ?? null,
      ]);
      sectionFormIdxs.push(i);
      const afterStr = sec.after?.trim() ?? "";
      const after = afterStr
        ? afterStr.split(",").map(Number).filter((n) => !isNaN(n))
        : [];
      sectionAfters.push({ idx: i, after });
    }
    if (sectionRows.length > 0) {
      const sectionRes = await bulkInsert(
        q,
        "recipe_step_sections",
        ["recipe_id", "key", "title", "sort_order", "option_id"],
        sectionRows,
        { returning: "id" },
      );
      for (let i = 0; i < sectionRes.rows.length; i++) {
        sectionFormIdxToDbId.set(
          sectionFormIdxs[i],
          sectionRes.rows[i].id as string,
        );
      }

      // Section-to-section deps
      const secDepRows: unknown[][] = [];
      for (const { idx, after } of sectionAfters) {
        const depId = sectionFormIdxToDbId.get(idx);
        if (!depId) continue;
        for (const depFormIdx of after) {
          const dependsOnId = sectionFormIdxToDbId.get(depFormIdx);
          if (dependsOnId && dependsOnId !== depId) {
            secDepRows.push([depId, dependsOnId]);
          }
        }
      }
      if (secDepRows.length > 0) {
        await bulkInsert(
          q,
          "recipe_section_deps",
          ["section_id", "depends_on"],
          secDepRows,
          { suffix: "ON CONFLICT DO NOTHING" },
        );
      }
    }
  }

  // Steps (need RETURNING id for media and deps)
  const steps = stepEntriesAll;
  const stepRows: unknown[][] = [];
  const stepIndexes: number[] = []; // original form indexes for media lookup
  const stepAfters: number[][] = []; // dependency indices per inserted step
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step.title?.trim() && !step.body?.trim()) continue;
    const secIdxRaw = step.section?.trim() ?? "";
    const secIdx = secIdxRaw === "" ? null : parseInt(secIdxRaw);
    const sectionId = secIdx != null && !isNaN(secIdx)
      ? sectionFormIdxToDbId.get(secIdx) ?? null
      : null;
    stepRows.push([
      recipeId,
      step.title?.trim() || "",
      step.body?.trim() || "",
      i,
      sectionId,
      stepOptionId.get(i) ?? null,
    ]);
    stepIndexes.push(i);
    // Parse "after" field: comma-separated form indices
    const afterStr = step.after?.trim() ?? "";
    stepAfters.push(
      afterStr ? afterStr.split(",").map(Number).filter((n) => !isNaN(n)) : [],
    );
  }

  if (stepRows.length > 0) {
    const stepRes = await bulkInsert(
      q,
      "recipe_steps",
      ["recipe_id", "title", "body", "sort_order", "section_id", "option_id"],
      stepRows,
      { returning: "id" },
    );

    // Build mapping: form index → inserted DB id
    const formIdxToDbId = new Map<number, string>();
    for (let si = 0; si < stepRes.rows.length; si++) {
      formIdxToDbId.set(stepIndexes[si], stepRes.rows[si].id as string);
    }

    // Step media - collect all then bulk insert
    const mediaRows: unknown[][] = [];
    for (let si = 0; si < stepRes.rows.length; si++) {
      const stepId = stepRes.rows[si].id;
      const formIdx = stepIndexes[si];
      let mi = 0;
      while (form.has(`steps[${formIdx}][media][${mi}]`)) {
        const mediaId = form.get(`steps[${formIdx}][media][${mi}]`) as string;
        if (mediaId) {
          mediaRows.push([stepId, mediaId, mi]);
        }
        mi++;
      }
    }
    if (mediaRows.length > 0) {
      await bulkInsert(q, "recipe_step_media", [
        "step_id",
        "media_id",
        "sort_order",
      ], mediaRows);
    }

    // Step dependencies from explicit "after" indices.
    // Drop any cross-section deps; those should be section-level, not step-level.
    const stepIdToSection = new Map<string, string | null>();
    for (let si = 0; si < stepRes.rows.length; si++) {
      stepIdToSection.set(
        stepRes.rows[si].id as string,
        (stepRows[si][4] as string | null) ?? null,
      );
    }
    const depRows: unknown[][] = [];
    for (let si = 0; si < stepRes.rows.length; si++) {
      const stepId = stepRes.rows[si].id as string;
      const stepSection = stepIdToSection.get(stepId) ?? null;
      for (const depFormIdx of stepAfters[si]) {
        const depDbId = formIdxToDbId.get(depFormIdx);
        if (!depDbId) continue;
        const depSection = stepIdToSection.get(depDbId) ?? null;
        // Same section (including both null) is allowed; cross-section is dropped.
        if (depSection === stepSection) {
          depRows.push([stepId, depDbId]);
        }
      }
    }
    if (depRows.length > 0) {
      await bulkInsert(q, "recipe_step_deps", [
        "step_id",
        "depends_on",
      ], depRows);
    }
  }

  // References
  const refEntries = parseFormArray(form, "refs");
  const refRows = refEntries
    .map((ref, i) => {
      if (!ref.referenced_recipe_id) return null;
      return [recipeId, ref.referenced_recipe_id, i];
    })
    .filter((r) => r != null);

  if (refRows.length > 0) {
    await bulkInsert(
      q,
      "recipe_references",
      ["recipe_id", "referenced_recipe_id", "sort_order"],
      refRows,
      { suffix: "ON CONFLICT DO NOTHING" },
    );
  }

  // Tags
  const mealTypes = (form.getAll("meal_type") as string[]).filter((v) =>
    v.trim()
  );
  const dietaryTags = (form.getAll("dietary") as string[]).filter((v) =>
    v.trim()
  );
  const cuisines = (form.getAll("cuisine") as string[]).filter((v) => v.trim());
  const tagRows = [
    ...mealTypes.map((v) => [recipeId, "meal_type", v.trim()]),
    ...dietaryTags.map((v) => [recipeId, "dietary", v.trim()]),
    ...cuisines.map((v) => [recipeId, "cuisine", v.trim()]),
  ];

  if (tagRows.length > 0) {
    await bulkInsert(
      q,
      "recipe_tags",
      ["recipe_id", "tag_type", "tag_value"],
      tagRows,
      { suffix: "ON CONFLICT DO NOTHING" },
    );
  }
}
