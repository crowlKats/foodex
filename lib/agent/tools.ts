// Tool definitions + executor for the agent loop.
//
// Read-before-write is enforced here (server-determined, §6 of the plan): the agent
// passes no version tokens. For live recipes/ingredients we compare the version the
// agent last *observed* (recorded in prior tool_result events) against the current
// updated_at. For staged items we compare the seq of the agent's last read/write of
// the item against the seq of the last user mutation of it. Failing guards return an
// is_error result and produce NO staging mutation.

import type Anthropic from "@anthropic-ai/sdk";
import type { QueryFn } from "../../db/mod.ts";
import { escapeLike } from "../../utils.ts";
import type { AgentEvent, Observation, StagingMutation } from "./events.ts";
import { applyPatch, type PatchOp } from "./merge.ts";
import {
  effective,
  foldStaging,
  isUserEdited,
  pendingItems,
} from "./staging.ts";
import { loadAgentRecipe } from "./recipe.ts";
import { loadAgentIngredient } from "./ingredient.ts";
import { ensureIngredientIds } from "../ingredient-resolve.ts";
import { addStock, expiringSoon, loadStock } from "../pantry.ts";
import { addPlanEntry, loadPlan, suggestRecipes } from "../plan.ts";
import { getOrCreateList, projectShoppingList } from "../shopping-list.ts";
import { isoVersion } from "./version.ts";
import { assertPublicUrl, fetchRaw, jinaSearch, jinaSummary } from "./fetch.ts";
import { importRecipeFromUrl } from "../url-import.ts";
import { stepDiagnostics } from "./validate-refs.ts";

export interface ToolCtx {
  q: QueryFn;
  householdId: string;
  /** Full log up to (not including) the tool_result being produced. */
  events: AgentEvent[];
}

export interface ToolExecResult {
  content: unknown;
  is_error: boolean;
  observations?: Observation[];
  staged?: StagingMutation;
}

// ── observed-version / touch helpers ───────────────────────────────

function observedVersion(
  events: AgentEvent[],
  target: string,
): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type !== "tool_result") continue;
    const obs = ev.payload.observations;
    if (!obs) continue;
    const hit = obs.find((o) => o.target === target);
    if (hit) return hit.version;
  }
  return undefined;
}

function agentTouchSeq(
  events: AgentEvent[],
  itemId: string,
): number | undefined {
  let seq: number | undefined;
  for (const ev of events) {
    if (ev.type !== "tool_result") continue;
    const touched = ev.payload.staged?.item_id === itemId ||
      ev.payload.observations?.some((o) => o.target === `staged:${itemId}`);
    if (touched) seq = ev.seq;
  }
  return seq;
}

function userTouchSeq(
  events: AgentEvent[],
  itemId: string,
): number | undefined {
  let seq: number | undefined;
  for (const ev of events) {
    if (
      (ev.type === "user_edit" || ev.type === "user_revert" ||
        ev.type === "user_discard") && ev.payload.item_id === itemId
    ) {
      seq = ev.seq;
    }
  }
  return seq;
}

function err(message: string): ToolExecResult {
  return { content: { error: message }, is_error: true };
}

// ── tool schemas ───────────────────────────────────────────────────

const patchOpsSchema = {
  type: "array",
  description:
    "Ordered patch operations keyed by stable identifier (ingredient key, step id, " +
    "section key, tool_id, referenced_recipe_id). Use scalar {op:'set',path,value}; " +
    "collection {op:'add',collection,value} / {op:'set',collection,key,field,value} / " +
    "{op:'remove',collection,key} / {op:'reorder',collection,order:[keys]}.",
  items: { type: "object" },
} as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_recipes",
    description:
      "List household recipes with metadata. Optional full-text `search` (title/description) " +
      "and `ingredient` filter (matches an ingredient name).",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string" },
        ingredient: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "get_recipe",
    description:
      "Get one recipe by slug with all fields, ingredients, steps (with stable ids), " +
      "sections, tools and references. Read this before proposing a modification to it.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "list_ingredients",
    description:
      "List ingredient entities (name/unit/density). Optional name `search`.",
    input_schema: {
      type: "object",
      properties: { search: { type: "string" } },
    },
  },
  {
    name: "get_ingredient",
    description:
      "Get one ingredient entity by id. Read before proposing an edit to it.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "get_pantry",
    description:
      "What the household has in stock right now: name, amount, unit, best-before " +
      "date and whether it is a staple. Read this before answering anything about " +
      "what they have, what is running out, or what they could cook tonight.",
    input_schema: {
      type: "object",
      properties: {
        expiring_within_days: {
          type: "number",
          description: "Only return stock going off within this many days.",
        },
      },
    },
  },
  {
    name: "get_shopping_list",
    description:
      "The current shopping list. Lines are computed from planned meals plus " +
      "manual entries, minus what the pantry already covers, so they change as " +
      "the plan and the pantry change.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_plan",
    description:
      "Meals the household has planned, each with the batch scale and which " +
      "ingredients the pantry cannot currently cover.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "suggest_recipes",
    description:
      "Recipes worth cooking next, ranked by what the pantry already covers and " +
      "what is about to expire. Use for 'what can I cook' and 'what should I use up'.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "plan_meal",
    description:
      "Put a recipe on the meal plan. This is a direct action, not a proposal: it " +
      "is trivially undone in the app. Whatever the pantry cannot cover appears on " +
      "the shopping list automatically; never add a recipe's ingredients by hand.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        scale: {
          type: "number",
          description:
            "Batch multiplier relative to the recipe's own quantity.",
        },
        planned_for: { type: "string", description: "YYYY-MM-DD, optional." },
      },
      required: ["slug"],
    },
  },
  {
    name: "unplan_meal",
    description:
      "Remove a planned meal by its entry id (from get_plan). Direct action.",
    input_schema: {
      type: "object",
      properties: { entry_id: { type: "string" } },
      required: ["entry_id"],
    },
  },
  {
    name: "add_to_shopping_list",
    description:
      "Add a one-off item to the shopping list, something not tied to a recipe. " +
      "For a recipe's ingredients use plan_meal instead. Direct action.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        ingredient_id: {
          type: "string",
          description: "Link it when the ingredient already exists.",
        },
        amount: { type: "number" },
        unit: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "add_pantry_item",
    description:
      "Record stock the household now has. Direct action, recorded in the pantry " +
      "ledger so it can be undone.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        ingredient_id: { type: "string" },
        amount: { type: "number" },
        unit: { type: "string" },
        expires_at: { type: "string", description: "YYYY-MM-DD, optional." },
      },
      required: ["name"],
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetch a public web URL and return its raw body text (truncated).",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "web_search",
    description: "Search the web and return a readable digest of results.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "fetch_page_summary",
    description:
      "Fetch a URL and return a clean, readable markdown summary of the page.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "fetch_recipe_structured",
    description:
      "Extract structured recipe data (schema.org JSON-LD, or a Foodex export) directly " +
      "from a recipe page URL. Fast and exact when the site provides it. When importing " +
      "from a URL try this FIRST, and fall back to fetch_url if it finds nothing. The " +
      "result may be incomplete (no sections/tags/tools); verify and fill gaps before " +
      "proposing.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "list_proposed",
    description: "List the changes you have proposed in this session.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_proposed",
    description:
      "Get one proposed change's current value. Read this before updating it.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_recipe",
    description:
      "Propose a brand-new recipe. Provide the full recipe object (title, ingredients " +
      "with keys, steps, etc.). The user reviews it before it is applied.",
    input_schema: {
      type: "object",
      properties: { recipe: { type: "object" } },
      required: ["recipe"],
    },
  },
  {
    name: "edit_recipe",
    description:
      "Propose edits to an EXISTING recipe as a patch. You must call get_recipe for this " +
      "slug first. Ops key on stable ids so unrelated concurrent edits don't conflict.",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" }, ops: patchOpsSchema },
      required: ["slug", "ops"],
    },
  },
  {
    name: "create_ingredient",
    description:
      "Propose a brand-new ingredient entity. Last resort: first search " +
      "list_ingredients for the core item (for \"bronze-die spaghetti\" search " +
      "\"spaghetti\") and link a reasonable existing match instead. Name new " +
      "entities generically, at the level someone shops (\"Spaghetti\", not " +
      "\"Bronze-die spaghetti\").",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        unit: { type: "string" },
        density: { type: "number" },
      },
      required: ["name"],
    },
  },
  {
    name: "edit_ingredient",
    description:
      "Propose edits to an EXISTING ingredient as a patch. Call get_ingredient first.",
    input_schema: {
      type: "object",
      properties: { ingredient_id: { type: "string" }, ops: patchOpsSchema },
      required: ["ingredient_id", "ops"],
    },
  },
  {
    name: "edit_proposed",
    description:
      "Apply further patch ops to a change you already proposed (any kind). Call " +
      "get_proposed first: the server rejects the update if it changed since you read it.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, ops: patchOpsSchema },
      required: ["id", "ops"],
    },
  },
  {
    name: "discard_proposed",
    description: "Remove a change you proposed. Call get_proposed first.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

// ── executor ───────────────────────────────────────────────────────

type Input = Record<string, unknown>;

function ensureStepIds(recipe: Record<string, unknown>): void {
  const steps = recipe.steps;
  if (Array.isArray(steps)) {
    steps.forEach((s, i) => {
      const step = s as Record<string, unknown>;
      if (!step.id) step.id = `tmp_${i}`;
    });
  }
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  toolUseId: string,
  ctx: ToolCtx,
): Promise<ToolExecResult> {
  const input = (rawInput ?? {}) as Input;
  const { q, householdId, events } = ctx;

  try {
    switch (name) {
      case "list_recipes": {
        const search = typeof input.search === "string" ? input.search : "";
        const ingredient = typeof input.ingredient === "string"
          ? input.ingredient
          : "";
        const limit = Math.min(Number(input.limit) || 20, 50);
        const offset = Number(input.offset) || 0;
        const clauses = ["r.household_id = $1"];
        const params: unknown[] = [householdId];
        if (search) {
          params.push(`%${escapeLike(search)}%`);
          clauses.push(
            `(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`,
          );
        }
        if (ingredient) {
          params.push(`%${escapeLike(ingredient)}%`);
          clauses.push(
            `EXISTS (SELECT 1 FROM recipe_ingredients ri
               LEFT JOIN ingredients g ON g.id = ri.ingredient_id
               WHERE ri.recipe_id = r.id
                 AND (ri.name ILIKE $${params.length} OR g.name ILIKE $${params.length}))`,
          );
        }
        params.push(limit, offset);
        const res = await q<{
          slug: string;
          title: string;
          description: string | null;
          prep_time: number | null;
          cook_time: number | null;
          difficulty: string | null;
          version: string;
          id: string;
        }>(
          `SELECT r.id, r.slug, r.title, r.description, r.prep_time, r.cook_time,
                  r.difficulty, r.updated_at AS version
           FROM recipes r WHERE ${clauses.join(" AND ")}
           ORDER BY r.updated_at DESC LIMIT $${
            params.length - 1
          } OFFSET $${params.length}`,
          params,
        );
        const observations: Observation[] = res.rows.map((r) => ({
          target: `recipe:${r.id}`,
          version: isoVersion(r.version),
        }));
        const recipes = res.rows.map(({ id: _id, ...rest }) => ({
          ...rest,
          version: isoVersion(rest.version),
        }));
        return { content: { recipes }, is_error: false, observations };
      }

      case "get_recipe": {
        const slug = String(input.slug ?? "");
        const idRes = await q<{ id: string }>(
          "SELECT id FROM recipes WHERE slug = $1 AND household_id = $2",
          [slug, householdId],
        );
        if (idRes.rows.length === 0) {
          return err(`No recipe with slug "${slug}".`);
        }
        const loaded = await loadAgentRecipe(q, idRes.rows[0].id);
        if (!loaded) return err(`No recipe with slug "${slug}".`);
        return {
          content: { recipe: loaded.recipe, slug },
          is_error: false,
          observations: [{
            target: `recipe:${idRes.rows[0].id}`,
            version: loaded.version,
          }],
        };
      }

      case "list_ingredients": {
        const search = typeof input.search === "string" ? input.search : "";
        const params: unknown[] = [];
        let where = "";
        if (search) {
          params.push(`%${escapeLike(search)}%`);
          where = "WHERE name ILIKE $1";
        }
        const res = await q<{
          id: string;
          name: string;
          unit: string | null;
          density: number | null;
          version: string;
        }>(
          `SELECT id, name, unit, density, updated_at AS version FROM ingredients
           ${where} ORDER BY name LIMIT 100`,
          params,
        );
        return {
          content: {
            ingredients: res.rows.map((r) => ({
              ...r,
              version: isoVersion(r.version),
            })),
          },
          is_error: false,
          observations: res.rows.map((r) => ({
            target: `ingredient:${r.id}`,
            version: isoVersion(r.version),
          })),
        };
      }

      case "get_ingredient": {
        const id = String(input.id ?? "");
        const loaded = await loadAgentIngredient(q, id);
        if (!loaded) return err(`No ingredient with id ${id}.`);
        return {
          content: { id, ...loaded.ingredient },
          is_error: false,
          observations: [{
            target: `ingredient:${id}`,
            version: loaded.version,
          }],
        };
      }

      // ── kitchen state ────────────────────────────────────────────
      //
      // These are direct actions rather than proposals. The review flow exists
      // to protect shared recipe content from a bad edit; putting a meal on the
      // plan or milk on the list is reversible with one click, and making the
      // user approve it would just be friction.

      case "get_pantry": {
        const stock = await loadStock({ query: q }, householdId);
        const withinDays = Number(input.expiring_within_days);
        const rows = Number.isFinite(withinDays)
          ? expiringSoon(stock, withinDays)
          : stock;
        return {
          content: {
            items: rows.map((r) => ({
              ingredient_id: r.ingredient_id,
              name: r.name,
              amount: r.amount,
              unit: r.unit,
              expires_at: r.expires_at,
              staple: r.staple,
            })),
          },
          is_error: false,
        };
      }

      case "get_shopping_list": {
        const projected = await projectShoppingList({ query: q }, householdId);
        return {
          content: {
            lines: projected.lines.map((l) => ({
              name: l.name,
              ingredient_id: l.ingredient_id,
              to_buy: l.needed,
              unit: l.unit,
              already_in_pantry: l.have,
              bought: l.purchase != null,
              wanted_for: l.sources.map((s) => s.label),
            })),
          },
          is_error: false,
        };
      }

      case "get_plan": {
        const entries = await loadPlan({ query: q }, householdId);
        return {
          content: {
            entries: entries.map((e) => ({
              entry_id: e.id,
              recipe: e.recipe_title,
              slug: e.recipe_slug,
              scale: e.scale,
              planned_for: e.planned_for,
              on_shopping_list: e.include_in_list,
              ready: e.ready,
              missing: e.missing,
            })),
          },
          is_error: false,
        };
      }

      case "suggest_recipes": {
        const stock = await loadStock({ query: q }, householdId);
        const suggestions = await suggestRecipes(
          { query: q },
          householdId,
          stock,
          expiringSoon(stock, 3),
          Math.min(Number(input.limit) || 6, 20),
        );
        return { content: { suggestions }, is_error: false };
      }

      case "plan_meal": {
        const slug = String(input.slug ?? "");
        const recipeRes = await q<{ id: string; title: string }>(
          "SELECT id, title FROM recipes WHERE slug = $1 AND (household_id = $2 OR private = false)",
          [slug, householdId],
        );
        if (recipeRes.rows.length === 0) return err(`No recipe "${slug}"`);
        const scale = Number(input.scale);
        const entryId = await addPlanEntry({ query: q }, {
          householdId,
          recipeId: recipeRes.rows[0].id,
          scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
          plannedFor: typeof input.planned_for === "string"
            ? input.planned_for
            : null,
        });
        return {
          content: {
            ok: true,
            entry_id: entryId,
            planned: recipeRes.rows[0].title,
          },
          is_error: false,
        };
      }

      case "unplan_meal": {
        const entryId = String(input.entry_id ?? "");
        await q(
          "DELETE FROM plan_entries WHERE id = $1 AND household_id = $2 AND status <> 'cooked'",
          [entryId, householdId],
        );
        return { content: { ok: true }, is_error: false };
      }

      case "add_to_shopping_list": {
        const name = String(input.name ?? "").trim();
        if (!name) return err("name is required");
        const list = await getOrCreateList({ query: q }, householdId);
        const amount = Number(input.amount);
        // Demands always link to a real ingredient (migration 068).
        const link = {
          name,
          ingredient_id: typeof input.ingredient_id === "string"
            ? input.ingredient_id
            : null,
          unit: typeof input.unit === "string" ? input.unit : null,
        };
        await ensureIngredientIds(q, [link]);
        await q(
          `INSERT INTO shopping_list_demands (
             shopping_list_id, ingredient_id, name, amount, unit, note
           )
           VALUES ($1, $2, $3, $4, $5, 'Added by the assistant')`,
          [
            list.id,
            link.ingredient_id,
            name,
            Number.isFinite(amount) ? amount : null,
            typeof input.unit === "string" ? input.unit : null,
          ],
        );
        return { content: { ok: true, added: name }, is_error: false };
      }

      case "add_pantry_item": {
        const name = String(input.name ?? "").trim();
        if (!name) return err("name is required");
        const amount = Number(input.amount);
        const added = await addStock({ query: q }, {
          householdId,
          ingredientId: typeof input.ingredient_id === "string"
            ? input.ingredient_id
            : null,
          name,
          amount: Number.isFinite(amount) ? amount : null,
          unit: typeof input.unit === "string" ? input.unit : null,
          kind: "bought",
          expiresAt: typeof input.expires_at === "string"
            ? input.expires_at
            : null,
          note: "Added by the assistant",
        });
        return {
          content: { ok: true, pantry_item_id: added.pantryItemId },
          is_error: false,
        };
      }

      case "fetch_url": {
        const out = await fetchRaw(String(input.url ?? ""));
        return { content: out, is_error: false };
      }
      case "web_search": {
        const out = await jinaSearch(String(input.query ?? ""));
        return { content: out, is_error: false };
      }
      case "fetch_page_summary": {
        const out = await jinaSummary(String(input.url ?? ""));
        return { content: out, is_error: false };
      }
      case "fetch_recipe_structured": {
        const url = String(input.url ?? "");
        assertPublicUrl(url);
        const recipe = await importRecipeFromUrl(url);
        return { content: { recipe }, is_error: false };
      }

      case "list_proposed": {
        const map = foldStaging(events);
        const items = pendingItems(map).map((it) => ({
          id: it.id,
          kind: it.kind,
          user_edited: isUserEdited(it),
          effective: effective(it),
        }));
        return {
          content: { items },
          is_error: false,
          observations: pendingItems(map).map((it) => ({
            target: `staged:${it.id}`,
            version: String(it.last_seq),
          })),
        };
      }

      case "get_proposed": {
        const id = String(input.id ?? "");
        const it = foldStaging(events).get(id);
        if (!it || it.status !== "pending") {
          return err(`No pending proposal ${id}.`);
        }
        const eff = effective(it);
        // Recipes carry their current step diagnostics, so the model can see
        // (and repair) validation problems in items staged before the write
        // checks existed, or introduced by user edits.
        const diag = it.kind === "create_recipe" || it.kind === "edit_recipe"
          ? stepDiagnostics(eff)
          : null;
        return {
          content: {
            id,
            kind: it.kind,
            base_version: it.base_version ?? null,
            effective: eff,
            ...(diag && diag.errors.length > 0
              ? { step_errors: diag.errors }
              : {}),
            ...(diag && diag.warnings.length > 0
              ? { step_warnings: diag.warnings }
              : {}),
          },
          is_error: false,
          observations: [{
            target: `staged:${id}`,
            version: String(it.last_seq),
          }],
        };
      }

      case "create_recipe": {
        const recipe = input.recipe as Record<string, unknown> | undefined;
        if (
          !recipe || typeof recipe.title !== "string" || !recipe.title.trim()
        ) {
          return err("recipe.title is required.");
        }
        ensureStepIds(recipe);
        const diag = stepDiagnostics(recipe);
        if (diag.errors.length > 0) {
          return err(
            `The step bodies fail validation: ${
              diag.errors.join("; ")
            }. Fix the steps (or the ingredient keys they reference) and retry.`,
          );
        }
        return {
          content: {
            item_id: toolUseId,
            proposed: true,
            ...(diag.warnings.length > 0
              ? { step_warnings: diag.warnings }
              : {}),
          },
          is_error: false,
          staged: {
            op: "create",
            kind: "create_recipe",
            item_id: toolUseId,
            full: recipe,
          },
        };
      }

      case "create_ingredient": {
        const nm = input.name;
        if (typeof nm !== "string" || !nm.trim()) {
          return err("name is required.");
        }
        return {
          content: { item_id: toolUseId, proposed: true },
          is_error: false,
          staged: {
            op: "create",
            kind: "create_ingredient",
            item_id: toolUseId,
            full: {
              name: nm,
              unit: input.unit ?? null,
              density: input.density ?? null,
            },
          },
        };
      }

      case "edit_recipe": {
        const slug = String(input.slug ?? "");
        const ops = (input.ops ?? []) as PatchOp[];
        const idRes = await q<{ id: string }>(
          "SELECT id FROM recipes WHERE slug = $1 AND household_id = $2",
          [slug, householdId],
        );
        if (idRes.rows.length === 0) {
          return err(`No recipe with slug "${slug}".`);
        }
        const recipeId = idRes.rows[0].id;
        const target = `recipe:${recipeId}`;
        const observed = observedVersion(events, target);
        const loaded = await loadAgentRecipe(q, recipeId);
        if (!loaded) return err(`No recipe with slug "${slug}".`);
        if (observed === undefined) {
          return err(
            `Call get_recipe("${slug}") before proposing edits to it.`,
          );
        }
        if (observed !== loaded.version) {
          return err(
            `"${slug}" changed since you read it; call get_recipe again, then retry.`,
          );
        }
        const base = loaded.recipe as unknown as Record<string, unknown>;
        const diag = stepDiagnostics(applyPatch(base, ops));
        if (diag.errors.length > 0) {
          return err(
            `After these ops, the step bodies fail validation: ${
              diag.errors.join("; ")
            }. When you swap or rename an ingredient, update the row's "key" ` +
              `AND every {{ ref }} in the step bodies in the same call.`,
          );
        }
        return {
          content: {
            item_id: toolUseId,
            proposed: true,
            ...(diag.warnings.length > 0
              ? { step_warnings: diag.warnings }
              : {}),
          },
          is_error: false,
          observations: [{ target: `staged:${toolUseId}`, version: "seed" }],
          staged: {
            op: "seed",
            kind: "edit_recipe",
            item_id: toolUseId,
            target: { recipe_id: recipeId, slug },
            base_version: loaded.version,
            base_data: base,
            ops,
          },
        };
      }

      case "edit_ingredient": {
        const ingredientId = String(input.ingredient_id ?? "");
        const ops = (input.ops ?? []) as PatchOp[];
        const target = `ingredient:${ingredientId}`;
        const observed = observedVersion(events, target);
        const loaded = await loadAgentIngredient(q, ingredientId);
        if (!loaded) return err(`No ingredient with id ${ingredientId}.`);
        if (observed === undefined) {
          return err(`Call get_ingredient before proposing edits to it.`);
        }
        if (observed !== loaded.version) {
          return err(
            `Ingredient changed since you read it; call get_ingredient again, then retry.`,
          );
        }
        return {
          content: { item_id: toolUseId, proposed: true },
          is_error: false,
          observations: [{ target: `staged:${toolUseId}`, version: "seed" }],
          staged: {
            op: "seed",
            kind: "edit_ingredient",
            item_id: toolUseId,
            target: { ingredient_id: ingredientId },
            base_version: loaded.version,
            base_data: loaded.ingredient as unknown as Record<string, unknown>,
            ops,
          },
        };
      }

      case "edit_proposed": {
        const id = String(input.id ?? "");
        const ops = (input.ops ?? []) as PatchOp[];
        const map = foldStaging(events);
        const it = map.get(id);
        if (!it || it.status !== "pending") {
          return err(`No pending proposal ${id}.`);
        }
        const a = agentTouchSeq(events, id);
        if (a === undefined) {
          return err(`Call get_proposed("${id}") before updating it.`);
        }
        const u = userTouchSeq(events, id);
        if (u !== undefined && u > a) {
          return err(
            `Proposal ${id} changed since you read it; call get_proposed again, then retry.`,
          );
        }
        const isCreateKind = it.kind === "create_recipe" ||
          it.kind === "create_ingredient";
        const nextFull = isCreateKind
          ? applyPatch(it.full ?? {}, ops)
          : applyPatch(it.base_data ?? {}, [...it.ops, ...ops]);
        let stepWarnings: string[] = [];
        if (it.kind === "create_recipe" || it.kind === "edit_recipe") {
          const diag = stepDiagnostics(nextFull);
          if (diag.errors.length > 0) {
            return err(
              `After these ops, the step bodies fail validation: ${
                diag.errors.join("; ")
              }. When you swap or rename an ingredient, update the row's ` +
                `"key" AND every {{ ref }} in the step bodies in the same call.`,
            );
          }
          stepWarnings = diag.warnings;
        }
        const staged: StagingMutation = isCreateKind
          ? { op: "update", item_id: id, full: nextFull }
          : { op: "update", item_id: id, ops };
        return {
          content: {
            item_id: id,
            proposed: true,
            ...(stepWarnings.length > 0 ? { step_warnings: stepWarnings } : {}),
          },
          is_error: false,
          observations: [{ target: `staged:${id}`, version: "updated" }],
          staged,
        };
      }

      case "discard_proposed": {
        const id = String(input.id ?? "");
        const map = foldStaging(events);
        const it = map.get(id);
        if (!it || it.status !== "pending") {
          return err(`No pending proposal ${id}.`);
        }
        const a = agentTouchSeq(events, id);
        if (a === undefined) {
          return err(`Call get_proposed("${id}") before discarding it.`);
        }
        const u = userTouchSeq(events, id);
        if (u !== undefined && u > a) {
          return err(
            `Proposal ${id} changed since you read it; call get_proposed again, then retry.`,
          );
        }
        return {
          content: { item_id: id, discarded: true },
          is_error: false,
          staged: { op: "discard", item_id: id },
        };
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(`Tool ${name} failed: ${(e as Error).message}`);
  }
}
