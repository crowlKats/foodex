// Dev-only: import recipes from examples/*.json into the database.
//
// Usage:
//   deno run -A examples/import.ts                        # import every example
//   deno run -A examples/import.ts lamingtons banana-bread # import named ones
//
// Recipes are slugged as `example-<filename>`. Re-running replaces them.
// Picks the household from $EXAMPLE_HOUSEHOLD_ID, else the first row in
// `households`. Set $DATABASE_URL the same way you do for `deno task dev`.

import { transaction } from "../db/mod.ts";
import { bulkInsert } from "../lib/bulk-insert.ts";
import { ensureIngredientIds } from "../lib/ingredient-resolve.ts";
import { slugify } from "../utils.ts";

interface ExampleIngredient {
  key: string;
  name: string;
  amount: number | null;
  unit: string;
}

interface ExampleSection {
  key: string;
  title: string;
  /** Keys of other sections this one depends on (must finish first). */
  after?: string[];
}

interface ExampleStep {
  title: string;
  body: string;
  section?: string | null;
  /** Indices of preceding steps. Defaults to linear chain (i-1). */
  after?: number[];
}

interface ExampleRecipe {
  title: string;
  description?: string;
  quantity_type?: string;
  quantity_value?: number;
  quantity_unit?: string;
  quantity_value2?: number | null;
  quantity_value3?: number | null;
  quantity_unit2?: string | null;
  prep_time?: number | null;
  cook_time?: number | null;
  rest_time?: number | null;
  difficulty?: string | null;
  private?: boolean;
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  tags?: { meal_type?: string[]; dietary?: string[]; cuisine?: string[] };
  ingredients: ExampleIngredient[];
  sections?: ExampleSection[];
  steps: ExampleStep[];
}

async function loadExamples(names: string[]): Promise<
  { name: string; recipe: ExampleRecipe }[]
> {
  const dir = new URL("./", import.meta.url);
  const out: { name: string; recipe: ExampleRecipe }[] = [];
  if (names.length === 0) {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        names.push(entry.name.replace(/\.json$/, ""));
      }
    }
    names.sort();
  }
  for (const name of names) {
    const path = new URL(`./${name}.json`, import.meta.url);
    const text = await Deno.readTextFile(path);
    out.push({ name, recipe: JSON.parse(text) as ExampleRecipe });
  }
  return out;
}

async function pickHousehold(): Promise<string> {
  const envId = Deno.env.get("EXAMPLE_HOUSEHOLD_ID");
  if (envId) return envId;
  const { query } = await import("../db/mod.ts");
  const res = await query<{ id: string; name: string }>(
    "SELECT id, name FROM households ORDER BY created_at LIMIT 1",
  );
  if (res.rows.length === 0) {
    throw new Error(
      "No households exist. Create one in the app first, or set EXAMPLE_HOUSEHOLD_ID.",
    );
  }
  console.log(
    `Using household "${res.rows[0].name}" (${res.rows[0].id}). ` +
      `Override with EXAMPLE_HOUSEHOLD_ID.`,
  );
  return res.rows[0].id;
}

async function importOne(
  householdId: string,
  fileName: string,
  recipe: ExampleRecipe,
) {
  const slug = `example-${slugify(fileName)}`;

  await transaction(async (q) => {
    // Replace any existing example with the same slug
    await q("DELETE FROM recipes WHERE slug = $1", [slug]);

    const recipeRes = await q<{ id: string }>(
      `INSERT INTO recipes (
         title, slug, description,
         quantity_type, quantity_value, quantity_unit,
         quantity_value2, quantity_value3, quantity_unit2,
         prep_time, cook_time, rest_time,
         difficulty, household_id, private,
         source_type, source_name, source_url
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        recipe.title,
        slug,
        recipe.description ?? null,
        recipe.quantity_type ?? "servings",
        recipe.quantity_value ?? 4,
        recipe.quantity_unit ?? "servings",
        recipe.quantity_value2 ?? null,
        recipe.quantity_value3 ?? null,
        recipe.quantity_unit2 ?? null,
        recipe.prep_time ?? null,
        recipe.cook_time ?? null,
        recipe.rest_time ?? null,
        recipe.difficulty ?? null,
        householdId,
        recipe.private ?? false,
        recipe.source_type ?? null,
        recipe.source_name ?? null,
        recipe.source_url ?? null,
      ],
    );
    const recipeId = recipeRes.rows[0].id;

    // Every line must link to a real ingredient: resolve names to existing
    // entities or create them (same rule as the app's save path).
    if (recipe.ingredients.length > 0) {
      const ingRefs = recipe.ingredients.map((ing) => ({
        name: ing.name,
        unit: ing.unit || null,
        ingredient_id: null as string | null,
      }));
      await ensureIngredientIds(q, ingRefs);
      await bulkInsert(
        q,
        "recipe_ingredients",
        [
          "recipe_id",
          "ingredient_id",
          "key",
          "name",
          "amount",
          "unit",
          "sort_order",
        ],
        recipe.ingredients.map((ing, i) => [
          recipeId,
          ingRefs[i].ingredient_id,
          ing.key,
          ing.name,
          ing.amount,
          ing.unit || null,
          i,
        ]),
      );
    }

    // Sections: insert before steps so we can reference section_id
    const sectionKeyToId = new Map<string, string>();
    if (recipe.sections && recipe.sections.length > 0) {
      const secRes = await bulkInsert(
        q,
        "recipe_step_sections",
        ["recipe_id", "key", "title", "sort_order"],
        recipe.sections.map((s, i) => [recipeId, s.key, s.title, i]),
        { returning: "id, key" },
      );
      for (const row of secRes.rows) {
        sectionKeyToId.set(String(row.key), String(row.id));
      }

      // Section-to-section deps
      const secDepRows: unknown[][] = [];
      for (const sec of recipe.sections) {
        const secId = sectionKeyToId.get(sec.key);
        if (!secId) continue;
        for (const depKey of sec.after ?? []) {
          const depId = sectionKeyToId.get(depKey);
          if (depId && depId !== secId) {
            secDepRows.push([secId, depId]);
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

    // Steps
    const stepRes = await bulkInsert(
      q,
      "recipe_steps",
      ["recipe_id", "title", "body", "sort_order", "section_id"],
      recipe.steps.map((s, i) => [
        recipeId,
        s.title,
        s.body,
        i,
        s.section ? sectionKeyToId.get(s.section) ?? null : null,
      ]),
      { returning: "id" },
    );
    const stepIds = stepRes.rows.map((r) => String(r.id));

    // Step deps. Default: previous step IN THE SAME SECTION (so the implicit
    // chain doesn't bleed across section boundaries, which would create an
    // invalid cross-section step dep). Explicit `after` is also filtered to
    // intra-section indices.
    const depRows: unknown[][] = [];
    recipe.steps.forEach((step, i) => {
      const sec = step.section ?? null;
      let after = step.after;
      if (after == null) {
        let prev = -1;
        for (let j = i - 1; j >= 0; j--) {
          if ((recipe.steps[j].section ?? null) === sec) {
            prev = j;
            break;
          }
        }
        after = prev >= 0 ? [prev] : [];
      }
      for (const depIdx of after) {
        if (depIdx < 0 || depIdx >= stepIds.length || depIdx === i) continue;
        const depSec = recipe.steps[depIdx].section ?? null;
        if (depSec !== sec) continue; // skip cross-section
        depRows.push([stepIds[i], stepIds[depIdx]]);
      }
    });
    if (depRows.length > 0) {
      await bulkInsert(
        q,
        "recipe_step_deps",
        ["step_id", "depends_on"],
        depRows,
      );
    }

    // Tags
    const tagRows: unknown[][] = [];
    for (const v of recipe.tags?.meal_type ?? []) {
      tagRows.push([recipeId, "meal_type", v]);
    }
    for (const v of recipe.tags?.dietary ?? []) {
      tagRows.push([recipeId, "dietary", v]);
    }
    for (const v of recipe.tags?.cuisine ?? []) {
      tagRows.push([recipeId, "cuisine", v]);
    }
    if (tagRows.length > 0) {
      await bulkInsert(
        q,
        "recipe_tags",
        ["recipe_id", "tag_type", "tag_value"],
        tagRows,
      );
    }
  });

  return slug;
}

async function main() {
  const args = Deno.args.filter((a) => !a.startsWith("--"));
  const examples = await loadExamples([...args]);
  if (examples.length === 0) {
    console.log("No examples found.");
    return;
  }
  const householdId = await pickHousehold();
  for (const { name, recipe } of examples) {
    const slug = await importOne(householdId, name, recipe);
    console.log(`✓ /recipes/${slug}  - ${recipe.title}`);
  }
  Deno.exit(0);
}

if (import.meta.main) {
  await main();
}
