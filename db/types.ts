// Database row types matching the PostgreSQL schema.
// These represent the shape of rows returned by queries, not necessarily
// full table schemas — JOIN queries produce composite types.

export interface Recipe {
  id: number;
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
  cover_image_id: number | null;
  household_id: number;
  private: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeWithCover extends Recipe {
  cover_image_url: string | null;
}

export interface RecipeWithCoverMedia extends Recipe {
  cover_media_id: number | null;
  cover_media_url: string | null;
  cover_media_filename: string | null;
  cover_media_content_type: string | null;
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  ingredient_id: number | null;
  name: string;
  amount: number | null;
  unit: string | null;
  key: string | null;
  sort_order: number;
  ingredient_name: string | null;
  ingredient_unit: string | null;
}

export interface RecipeTool {
  id: number;
  recipe_id: number;
  tool_id: number;
  usage_description: string | null;
  settings: string | null;
  sort_order: number;
  tool_name: string;
  tool_description: string | null;
}

export interface RecipeStep {
  id: number;
  recipe_id: number;
  title: string;
  body: string;
  sort_order: number;
}

export interface RecipeReference {
  id: number;
  recipe_id: number;
  referenced_recipe_id: number;
  sort_order: number;
  ref_title: string;
  ref_slug: string;
}

export interface RecipeTag {
  id: number;
  recipe_id: number;
  tag_type: "meal_type" | "dietary";
  tag_value: string;
}

export interface Ingredient {
  id: number;
  name: string;
  unit: string | null;
  created_at: string;
}

export interface IngredientBrand {
  id: number;
  ingredient_id: number;
  brand: string;
  created_at: string;
}

export interface IngredientPrice {
  id: number;
  ingredient_id: number;
  brand_id: number | null;
  store_id: number;
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
  id: number;
  name: string;
  currency: string;
  created_at: string;
}

export interface StoreWithLocationCount extends Store {
  location_count: number;
}

export interface StoreLocation {
  id: number;
  store_id: number;
  address: string;
  created_at: string;
}

export interface Tool {
  id: number;
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
  id: number;
  name: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: number;
  household_id: number;
  user_id: number;
  role: "owner" | "member";
  joined_at: string;
  // JOIN fields
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface HouseholdInvite {
  id: number;
  household_id: number;
  code: string;
  created_by: number;
  created_at: string;
  expires_at: string;
  // JOIN field
  household_name?: string;
}

export interface PantryItem {
  id: number;
  household_id: number;
  ingredient_id: number | null;
  name: string;
  amount: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingList {
  id: number;
  household_id: number;
  name: string;
  created_at: string;
}

export interface ShoppingListItem {
  id: number;
  shopping_list_id: number;
  ingredient_id: number | null;
  name: string;
  amount: number | null;
  unit: string | null;
  store_id: number | null;
  checked: boolean;
  recipe_id: number | null;
  sort_order: number;
  created_at: string;
  // JOIN fields
  recipe_title?: string;
  recipe_slug?: string;
}

export interface Media {
  id: number;
  key: string;
  url: string;
  content_type: string;
  filename: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface StepMedia {
  step_id: number;
  sort_order: number;
  media_id: number;
  url: string;
}

export interface RecipeListItem extends RecipeWithCover {
  tags: { meal_types: string[]; dietary: string[] };
}

export interface HouseholdRecipe {
  id: number;
  title: string;
  slug: string;
  private: boolean;
}

export interface ToolUsage {
  id: number;
  recipe_id: number;
  tool_id: number;
  usage_description: string | null;
  settings: string | null;
  recipe_title: string;
  recipe_slug: string;
}
