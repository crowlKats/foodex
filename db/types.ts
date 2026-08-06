// Database row types matching the PostgreSQL schema.
// These represent the shape of rows returned by queries, not necessarily
// full table schemas — JOIN queries produce composite types.

export interface Recipe {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  quantity_type: string;
  quantity_value: number;
  quantity_unit: string;
  quantity_value2: number | null;
  quantity_value3: number | null;
  quantity_unit2: string | null;
  quantity_servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  rest_time: number | null;
  cover_image_id: string | null;
  difficulty: string | null;
  household_id: string;
  private: boolean;
  forked_from_id: string | null;
  source_type: string | null;
  source_name: string | null;
  source_url: string | null;
  output_ingredient_id: string | null;
  output_amount: number | null;
  output_unit: string | null;
  output_expires_days: number | null;
  dish_id: string | null;
  dish_manual: boolean;
  created_at: string;
  updated_at: string;
}

/** A dish: the identity shared by every recipe that makes the same thing. */
export interface Dish {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface RecipeWithCover extends Recipe {
  cover_image_url: string | null;
}

export interface RecipeWithCoverMedia extends Recipe {
  cover_media_id: string | null;
  cover_media_url: string | null;
  cover_media_filename: string | null;
  cover_media_content_type: string | null;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  /** Required since migration 067 — a line always links to a real ingredient. */
  ingredient_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  key: string | null;
  sort_order: number;
  ingredient_name: string | null;
  ingredient_unit: string | null;
}

export interface RecipeTool {
  id: string;
  recipe_id: string;
  tool_id: string;
  usage_description: string | null;
  settings: string | null;
  sort_order: number;
  tool_name: string;
  tool_description: string | null;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  title: string;
  body: string;
  sort_order: number;
  section_id: string | null;
}

export interface RecipeStepSection {
  id: string;
  recipe_id: string;
  key: string;
  title: string;
  sort_order: number;
}

export interface RecipeStepDep {
  step_id: string;
  depends_on: string;
}

export interface RecipeSectionDep {
  section_id: string;
  depends_on: string;
}

export interface RecipeReference {
  id: string;
  recipe_id: string;
  referenced_recipe_id: string;
  sort_order: number;
  ref_title: string;
  ref_slug: string;
}

export interface RecipeTag {
  id: string;
  recipe_id: string;
  tag_type: "meal_type" | "dietary";
  tag_value: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string | null;
  density: number | null;
  /** Scales with recipes but is never bought or counted as missing. */
  always_on_hand: boolean;
  created_at: string;
}

export interface IngredientBrand {
  id: string;
  ingredient_id: string;
  brand: string;
  created_at: string;
}

export interface IngredientPrice {
  id: string;
  ingredient_id: string;
  brand_id: string | null;
  store_id: string;
  price: number;
  amount: number | null;
  unit: string | null;
  updated_at: string;
  // JOIN fields
  store_name?: string;
  store_currency?: string;
  brand_name?: string;
  ingredient_name?: string;
  ingredient_unit?: string;
}

export interface Store {
  id: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface StoreWithLocationCount extends Store {
  location_count: number;
}

export interface StoreLocation {
  id: string;
  store_id: string;
  address: string;
  created_at: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ToolWithOwned extends Tool {
  owned: boolean;
}

export interface StoreWithOwned extends Store {
  owned: boolean;
}

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  // JOIN fields
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface HouseholdInvite {
  id: string;
  household_id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  // JOIN field
  household_name?: string;
}

/** Current balance of one thing in the pantry. Derived from pantry_transactions. */
export interface PantryItem {
  id: string;
  household_id: string;
  /** Required since migration 068 — stock always links to a real ingredient. */
  ingredient_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  expires_at: string | null;
  /** Always on hand — counts as available in any amount, never deducted. */
  staple: boolean;
  created_at: string;
  updated_at: string;
}

/** Why stock moved. Amounts are signed; see lib/pantry.ts. */
export interface PantryTransaction {
  id: string;
  household_id: string;
  pantry_item_id: string | null;
  /** Null only on rows that are not stock movements (consumption claim markers). */
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  kind: "bought" | "cooked" | "wasted" | "adjusted" | "produced";
  source_type: string | null;
  source_id: string | null;
  source_seq: number;
  store_id: string | null;
  unit_price: number | null;
  expires_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ShoppingList {
  id: string;
  household_id: string;
  share_token: string | null;
  share_token_expires_at: string | null;
  created_at: string;
}

/** A hand-added "we need this". Recipe demand comes from plan_entries. */
export interface ShoppingListDemand {
  id: string;
  shopping_list_id: string;
  /** Required since migration 068. */
  ingredient_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** A ticked-off line. Its presence is what "checked" means. */
export interface ShoppingListPurchase {
  id: string;
  shopping_list_id: string;
  match_key: string;
  /** Required since migration 068. */
  ingredient_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  store_id: string | null;
  price: number | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

/** A meal the household intends to cook. */
export interface PlanEntryRow {
  id: string;
  household_id: string;
  recipe_id: string;
  scale: number;
  planned_for: string | null;
  status: "planned" | "cooked" | "skipped";
  include_in_list: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cooked_at: string | null;
}

export interface Media {
  id: string;
  key: string;
  url: string;
  content_type: string;
  filename: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface StepMedia {
  step_id: string;
  sort_order: number;
  media_id: string;
  url: string;
}

export interface RecipeListItem extends RecipeWithCover {
  tags: { meal_types: string[]; dietary: string[] };
  /** Owning household, for attribution on cross-household lists. */
  household_name?: string | null;
  dish_slug?: string | null;
  /** Visible recipes for the same dish, this one included. */
  dish_count?: number;
}

export interface HouseholdRecipe {
  id: string;
  title: string;
  slug: string;
  private: boolean;
}

export interface ToolUsage {
  id: string;
  recipe_id: string;
  tool_id: string;
  usage_description: string | null;
  settings: string | null;
  recipe_title: string;
  recipe_slug: string;
}

export interface Collection {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  cover_image_id: string | null;
  private: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionWithCover extends Collection {
  cover_image_url: string | null;
  recipe_count: number;
}

export interface CollectionRecipe {
  id: string;
  collection_id: string;
  recipe_id: string;
  sort_order: number;
  added_at: string;
}

export interface CollectionShare {
  id: string;
  collection_id: string;
  household_id: string;
  shared_by: string;
  shared_at: string;
  // JOIN fields
  household_name?: string;
  sharer_name?: string;
}

export interface RecipeDraft {
  id: string;
  household_id: string;
  recipe_data: Record<string, unknown>;
  ai_messages: { role: "user" | "assistant"; content: string }[];
  ai_thinking: string | null;
  cover_image_id: string | null;
  source: "manual" | "ocr" | "generate" | "url" | "text";
  created_at: string;
  updated_at: string;
}

// ── Agentic recipe chat ────────────────────────────────────────────
// Sessions are per-user. The staging area and conversation are both pure
// projections (folds) over the ordered agent_events log — see lib/agent/.

export interface AgentSession {
  id: string;
  user_id: string;
  household_id: string;
  title: string;
  /** Rollback head; events with seq > head_seq are logically truncated. */
  head_seq: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentEventRow {
  id: string;
  session_id: string;
  seq: number;
  type: string;
  payload: unknown;
  created_at: string;
}
