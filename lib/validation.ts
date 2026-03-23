import { z } from "zod";

// ── Shared primitives ──────────────────────────────────────────────

export const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();
const nonEmptyString = z.string().min(1);

const ingredientItem = z.object({
  ingredient_id: uuid.nullable(),
  name: z.string(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
});

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
    ingredient_id: uuid.optional(),
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
  }),
  z.object({
    action: z.literal("deduct_recipe"),
    items: z.array(ingredientItem),
  }),
  z.object({
    action: z.literal("merge"),
    target_id: uuid,
    source_ids: z.array(uuid).min(1),
  }),
]);

// ── Shopping List ──────────────────────────────────────────────────

export const ShoppingListAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_recipe"),
    recipe_id: uuid,
    items: z.array(ingredientItem),
  }),
  z.object({
    action: z.literal("add_ingredient"),
    ingredient_id: uuid.optional(),
    name: nonEmptyString,
    amount: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    recipe_id: uuid.optional(),
  }),
  z.object({
    action: z.literal("update_item"),
    item_id: uuid,
    store_id: uuid.nullable().optional(),
    checked: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("remove_item"),
    item_id: uuid,
  }),
  z.object({ action: z.literal("clear_checked") }),
  z.object({ action: z.literal("clear_all") }),
  z.object({ action: z.literal("generate_share_link") }),
  z.object({ action: z.literal("revoke_share_link") }),
]);

// ── Shopping List Shared ───────────────────────────────────────────

export const ShoppingListSharedBody = z.object({
  token: nonEmptyString,
  action: z.literal("toggle_checked"),
  item_id: uuid,
  checked: z.boolean(),
});

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
  source: z.enum(["manual", "ocr", "generate", "url"]).optional(),
  source_url: z.string().optional(),
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
