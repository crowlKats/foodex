// Apply a staged item to real household data. Pure user action — never invokes
// the agent. For modify/edit kinds, re-checks the base version against live and
// runs the path-level 3-way merge (merge.ts). On a real conflict it applies
// nothing and reports the conflicting paths so the UI can offer "Ask AI to resolve".

import type { QueryFn } from "../../db/mod.ts";
import {
  applyPatch,
  INGREDIENT_SCHEMA,
  overlappingChangedPaths,
  RECIPE_SCHEMA,
} from "./merge.ts";
import { effective, type StagedItem } from "./staging.ts";
import type { ApplyResult } from "./events.ts";
import {
  type AgentRecipe,
  createRecipeFromData,
  loadAgentRecipe,
  updateRecipeFromData,
} from "./recipe.ts";
import {
  type AgentIngredient,
  createIngredientFromData,
  loadAgentIngredient,
  updateIngredientFromData,
} from "./ingredient.ts";

export interface ApplyOutcome {
  result?: ApplyResult;
  conflict?: { conflict_paths: string[]; live_version: string };
}

export interface ApplyContext {
  /**
   * Resolve a recipe ingredient's `ingredient_id` to a real ingredients.id.
   * Handles existing ids and references to staged ingredient items (which are
   * created as a dependency), returning null if it can't be linked.
   */
  resolveIngredientId?: (ref: string | null) => Promise<string | null>;
}

type Obj = Record<string, unknown>;

/** Resolve every ingredient link on a recipe object to a real ingredients.id. */
async function resolveRecipeLinks(
  recipe: Obj,
  ctx: ApplyContext | undefined,
): Promise<void> {
  if (!ctx?.resolveIngredientId) return;
  const ings = recipe.ingredients;
  if (!Array.isArray(ings)) return;
  for (const ing of ings as Obj[]) {
    ing.ingredient_id = await ctx.resolveIngredientId(
      (ing.ingredient_id as string | null) ?? null,
    );
  }
}

/** Apply one staged item within the caller's transaction. */
export async function applyStaged(
  q: QueryFn,
  householdId: string,
  item: StagedItem,
  ctx?: ApplyContext,
): Promise<ApplyOutcome> {
  const eff = effective(item);

  switch (item.kind) {
    case "create_recipe": {
      await resolveRecipeLinks(eff, ctx);
      const { recipe_id, slug } = await createRecipeFromData(
        q,
        householdId,
        eff as unknown as AgentRecipe,
      );
      return { result: { kind: "recipe", recipe_id, slug } };
    }

    case "create_ingredient": {
      const { ingredient_id } = await createIngredientFromData(
        q,
        eff as unknown as AgentIngredient,
      );
      return { result: { kind: "ingredient", ingredient_id } };
    }

    case "edit_recipe": {
      const recipeId = item.target?.recipe_id;
      if (!recipeId) {
        throw new Error("edit_recipe item missing target recipe_id");
      }
      const live = await loadAgentRecipe(q, recipeId);
      if (!live) {
        return {
          conflict: {
            conflict_paths: [
              "(the recipe was deleted since you staged this edit)",
            ],
            live_version: "",
          },
        };
      }
      if (live.version !== item.base_version) {
        const conflicts = overlappingChangedPaths(
          item.base_data ?? {},
          live.recipe as unknown as Obj,
          item.ops,
          RECIPE_SCHEMA,
        );
        if (conflicts.length > 0) {
          return {
            conflict: { conflict_paths: conflicts, live_version: live.version },
          };
        }
      }
      // Clean (or drift with no overlap): apply ops onto the live recipe so any
      // concurrent change on untouched paths is preserved.
      const merged = applyPatch(live.recipe as unknown as Obj, item.ops);
      await resolveRecipeLinks(merged, ctx);
      const { slug } = await updateRecipeFromData(
        q,
        recipeId,
        merged as unknown as AgentRecipe,
      );
      return { result: { kind: "recipe", recipe_id: recipeId, slug } };
    }

    case "edit_ingredient": {
      const ingredientId = item.target?.ingredient_id;
      if (!ingredientId) {
        throw new Error("edit_ingredient item missing target ingredient_id");
      }
      const live = await loadAgentIngredient(q, ingredientId);
      if (!live) {
        return {
          conflict: {
            conflict_paths: [
              "(the ingredient was deleted since you staged this edit)",
            ],
            live_version: "",
          },
        };
      }
      if (live.version !== item.base_version) {
        const conflicts = overlappingChangedPaths(
          item.base_data ?? {},
          live.ingredient as unknown as Obj,
          item.ops,
          INGREDIENT_SCHEMA,
        );
        if (conflicts.length > 0) {
          return {
            conflict: { conflict_paths: conflicts, live_version: live.version },
          };
        }
      }
      const merged = applyPatch(live.ingredient as unknown as Obj, item.ops);
      await updateIngredientFromData(
        q,
        ingredientId,
        merged as unknown as AgentIngredient,
      );
      return { result: { kind: "ingredient", ingredient_id: ingredientId } };
    }
  }
}
