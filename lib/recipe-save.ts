import { bulkInsert } from "./bulk-insert.ts";
import { parseFormArray } from "./form.ts";
import type { QueryFn } from "../db/mod.ts";

/**
 * Save all recipe child records (ingredients, tools, steps, step media, refs, tags).
 * Caller is responsible for wrapping this in a transaction.
 */
export async function saveRecipeChildren(
  q: QueryFn,
  recipeId: string,
  form: FormData,
): Promise<void> {
  // Ingredients
  const ingredients = parseFormArray(form, "ingredients");
  const ingRows = ingredients
    .map((ing, i) => {
      if (!ing.name?.trim()) return null;
      return [
        recipeId,
        ing.ingredient_id?.trim() || null,
        ing.key?.trim() || null,
        ing.name.trim(),
        ing.amount ? parseFloat(ing.amount) : null,
        ing.unit?.trim() || null,
        i,
      ];
    })
    .filter((r) => r != null);

  if (ingRows.length > 0) {
    await bulkInsert(q, "recipe_ingredients", [
      "recipe_id",
      "ingredient_id",
      "key",
      "name",
      "amount",
      "unit",
      "sort_order",
    ], ingRows);
  }

  // Tools
  const toolEntries = parseFormArray(form, "tools");
  const toolRows = toolEntries
    .map((t, i) => {
      if (!t.tool_id) return null;
      return [
        recipeId,
        t.tool_id,
        t.usage_description?.trim() || null,
        t.settings?.trim() || null,
        i,
      ];
    })
    .filter((r) => r != null);

  if (toolRows.length > 0) {
    await bulkInsert(q, "recipe_tools", [
      "recipe_id",
      "tool_id",
      "usage_description",
      "settings",
      "sort_order",
    ], toolRows);
  }

  // Sections (insert before steps so steps can reference section_id)
  const sectionEntries = parseFormArray(form, "sections");
  const sectionFormIdxToDbId = new Map<number, string>();
  // afters by section form index — collected here, inserted after sections exist
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
        ["recipe_id", "key", "title", "sort_order"],
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
  const steps = parseFormArray(form, "steps");
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
      ["recipe_id", "title", "body", "sort_order", "section_id"],
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
    // Drop any cross-section deps — those should be section-level, not step-level.
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
  const tagRows = [
    ...mealTypes.map((v) => [recipeId, "meal_type", v.trim()]),
    ...dietaryTags.map((v) => [recipeId, "dietary", v.trim()]),
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
