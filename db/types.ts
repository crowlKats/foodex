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
  prep_time: number | null;
  cook_time: number | null;
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
  created_at: string;
  updated_at: string;
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
  ingredient_id: string | null;
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

export interface PantryItem {
  id: string;
  household_id: string;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingList {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
}

export interface ShoppingListItem {
  id: string;
  shopping_list_id: string;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  store_id: string | null;
  checked: boolean;
  recipe_id: string | null;
  sort_order: number;
  created_at: string;
  // JOIN fields
  recipe_title?: string;
  recipe_slug?: string;
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
  source: "manual" | "ocr" | "generate";
  created_at: string;
  updated_at: string;
}
