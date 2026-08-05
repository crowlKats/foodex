import { z } from "zod";

// ── Shared primitives ──────────────────────────────────────────────

export const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const nonEmptyString = z.string().min(1);

// ── Parse helper ───────────────────────────────────────────────────

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; response: Response };

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ParseSuccess<T> | ParseFailure> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      success: false,
      response: Response.json(
        { error: "Invalid JSON" },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      response: Response.json(
        {
          error: "Validation failed",
          fields: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    };
  }

  return { success: true, data: result.data };
}

// ── Pantry ─────────────────────────────────────────────────────────

export const PantryAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    // Free-text adds send an explicit null when no catalog ingredient is
    // selected; the add path handles that fine (`resolveIngredient` returns
    // null), so the schema has to accept it too.
    ingredient_id: optionalUuid,
    create_ingredient: z.boolean().optional(),
    name: z.string(),
    unit: z.string().nullable().optional(),
    brand: z.string().optional(),
    store_id: uuid.optional(),
    price: z.number().optional(),
    amount: z.number().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("update"),
    item_id: uuid,
    amount: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("remove"),
    item_id: uuid,
    /** Record where it went: thrown out, or consumed off-recipe. */
    reason: z.enum(["wasted", "adjusted"]).optional(),
  }),
  z.object({
    action: z.literal("merge"),
    target_id: uuid,
    source_ids: z.array(uuid).min(1),
  }),
  z.object({
    action: z.literal("set_staple"),
    item_id: uuid,
    staple: z.boolean(),
  }),
]);

// ── Shopping List ──────────────────────────────────────────────────
//
// Lines are projected from demand, so the API talks about demands and
// purchases. `match_key` identifies a projected line (see lib/inventory.ts).

export const ShoppingListAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_demand"),
    ingredient_id: uuid.optional(),
    name: nonEmptyString,
    amount: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("remove_line"),
    match_key: nonEmptyString,
  }),
  z.object({
    action: z.literal("buy_line"),
    match_key: nonEmptyString,
    ingredient_id: uuid.nullable().optional(),
    name: nonEmptyString,
    amount: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    store_id: uuid.nullable().optional(),
    price: z.number().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("unbuy_line"),
    match_key: nonEmptyString,
  }),
  z.object({
    action: z.literal("set_store"),
    match_key: nonEmptyString,
    ingredient_id: uuid.nullable().optional(),
    store_id: uuid.nullable(),
  }),
  z.object({ action: z.literal("clear_bought") }),
  z.object({ action: z.literal("clear_all") }),
  z.object({ action: z.literal("generate_share_link") }),
  z.object({ action: z.literal("revoke_share_link") }),
]);

// ── Shopping List Shared ───────────────────────────────────────────

export const ShoppingListSharedBody = z.object({
  token: nonEmptyString,
  action: z.enum(["buy_line", "unbuy_line"]),
  match_key: nonEmptyString,
  ingredient_id: uuid.nullable().optional(),
  name: nonEmptyString.optional(),
  amount: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

// ── Meal Plan ──────────────────────────────────────────────────────

export const PlanAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    // One of recipe_id / dish_id is required; enforced in the handler since
    // a discriminated-union member has to stay a plain object schema.
    recipe_id: uuid.optional(),
    dish_id: uuid.optional(),
    target_servings: z.number().positive().optional(),
    scale: z.number().positive().optional(),
    planned_for: z.string().nullable().optional(),
    include_in_list: z.boolean().optional(),
    note: z.string().nullable().optional(),
  }),
  z.object({
    /** Choose (or switch) the recipe for a dish-planned entry. */
    action: z.literal("pin"),
    entry_id: uuid,
    recipe_id: uuid,
  }),
  z.object({
    action: z.literal("update"),
    entry_id: uuid,
    scale: z.number().positive().optional(),
    target_servings: z.number().positive().optional(),
    planned_for: z.string().nullable().optional(),
    include_in_list: z.boolean().optional(),
    status: z.enum(["planned", "skipped"]).optional(),
  }),
  z.object({
    action: z.literal("remove"),
    entry_id: uuid,
  }),
  z.object({
    action: z.literal("cook"),
    entry_id: uuid,
  }),
  z.object({
    action: z.literal("uncook"),
    entry_id: uuid,
  }),
  z.object({
    /** Cook something that was never planned; recorded as history either way. */
    action: z.literal("cook_now"),
    recipe_id: uuid,
    scale: z.number().positive().optional(),
  }),
]);

// ── Import URL ─────────────────────────────────────────────────────

export const ImportUrlBody = z.object({
  url: z.string().url(),
});

// ── Refine Recipe ──────────────────────────────────────────────────

export const RefineRecipeBody = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).min(1).refine(
    (msgs) => msgs[msgs.length - 1].role === "user",
    { message: "Last message must be from the user" },
  ),
});

// ── Generate Recipe ────────────────────────────────────────────────

export const GenerateRecipeBody = z.object({
  max_minutes: z.number().positive().optional(),
  instructions: z.string().optional(),
});

// ── Substitutions ──────────────────────────────────────────────────

export const SubstitutionsBody = z.object({
  ingredient: nonEmptyString,
  recipe_title: nonEmptyString,
  all_ingredients: z.array(z.string()).optional(),
});

// ── Push Subscription ──────────────────────────────────────────────

export const PushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: nonEmptyString,
    auth: nonEmptyString,
  }),
  timezone: z.string().optional(),
});

export const PushSubscriptionDeleteBody = z.object({
  endpoint: z.string().url(),
});

// ── Favorite ───────────────────────────────────────────────────────

export const FavoriteBody = z.object({
  recipe_id: uuid,
});

// ── Collection Recipes ─────────────────────────────────────────────

export const CollectionRecipesBody = z.object({
  action: z.enum(["add", "remove"]),
  collection_id: uuid,
  recipe_id: uuid,
});

// ── Drafts ─────────────────────────────────────────────────────────

export const DraftCreateBody = z.object({
  recipe_data: z.record(z.unknown()).optional(),
  ai_messages: z.array(z.unknown()).optional(),
  ai_thinking: z.string().nullable().optional(),
  cover_image_id: optionalUuid,
  source: z.enum(["manual", "ocr", "generate", "url", "text"]).optional(),
  source_url: z.string().optional(),
});

export const ImportTextBody = z.object({
  text: z.string().min(20).max(20000),
  context: z.string().max(500).optional(),
});

export const DraftUpdateBody = z.object({
  recipe_data: z.record(z.unknown()).optional(),
  ai_messages: z.array(z.unknown()).optional(),
  ai_thinking: z.string().nullable().optional(),
  cover_image_id: optionalUuid,
});

// ── Barcode ────────────────────────────────────────────────────────

export const BarcodeQuery = z.object({
  code: z.string().regex(/^\d+$/, "Code must be digits only"),
});
