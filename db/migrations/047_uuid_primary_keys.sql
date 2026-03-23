-- Migration 047: Convert all SERIAL PRIMARY KEY columns to UUID.
-- This is a destructive migration that drops and recreates all tables.
-- No data migration is performed.

-- ============================================================
-- 1. Drop ALL tables in reverse dependency order
-- ============================================================

DROP TABLE IF EXISTS collection_shares CASCADE;
DROP TABLE IF EXISTS collection_recipes CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS recipe_drafts CASCADE;
DROP TABLE IF EXISTS recipe_favorites CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS shopping_list_items CASCADE;
DROP TABLE IF EXISTS shopping_lists CASCADE;
DROP TABLE IF EXISTS pantry_items CASCADE;
DROP TABLE IF EXISTS household_invites CASCADE;
DROP TABLE IF EXISTS household_tools CASCADE;
DROP TABLE IF EXISTS household_stores CASCADE;
DROP TABLE IF EXISTS household_members CASCADE;
DROP TABLE IF EXISTS ocr_usage CASCADE;
DROP TABLE IF EXISTS recipe_step_media CASCADE;
DROP TABLE IF EXISTS recipe_references CASCADE;
DROP TABLE IF EXISTS recipe_tools CASCADE;
DROP TABLE IF EXISTS recipe_tags CASCADE;
DROP TABLE IF EXISTS recipe_steps CASCADE;
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS ingredient_prices CASCADE;
DROP TABLE IF EXISTS ingredient_brands CASCADE;
DROP TABLE IF EXISTS store_locations CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;
DROP TABLE IF EXISTS tools CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS magic_link_tokens CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS households CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- 2. Drop existing trigger functions
-- ============================================================

DROP FUNCTION IF EXISTS update_recipe_search_vector() CASCADE;
DROP FUNCTION IF EXISTS update_grocery_search_vector() CASCADE;

-- ============================================================
-- 3. Recreate ALL tables with UUID primary keys
-- ============================================================

-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  authentik_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  unit_system TEXT NOT NULL DEFAULT 'metric',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

-- sessions (TEXT PK stays, user_id becomes UUID)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- magic_link_tokens (TEXT PK stays, no user_id — has email)
CREATE TABLE magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_tokens_email ON magic_link_tokens(email);
CREATE INDEX idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);

-- households
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- household_members
CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id),
  CONSTRAINT household_members_user_id_unique UNIQUE (user_id)
);

-- household_invites
CREATE TABLE household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

-- stores
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stores_name_unique UNIQUE (name)
);

-- store_locations
CREATE TABLE store_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tools
CREATE TABLE tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- household_tools (composite PK stays, both columns become UUID)
CREATE TABLE household_tools (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, tool_id)
);

-- household_stores (composite PK stays, both columns become UUID)
CREATE TABLE household_stores (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, store_id)
);

-- ingredients
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  density DOUBLE PRECISION,
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ingredient_brands
CREATE TABLE ingredient_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ingredient_prices
CREATE TABLE ingredient_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES ingredient_brands(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  amount NUMERIC(10,3),
  unit TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ingredient_id, store_id)
);

-- media
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_household_id ON media(household_id);

-- recipes
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  quantity_type TEXT NOT NULL DEFAULT 'servings',
  quantity_value NUMERIC(10,2) NOT NULL DEFAULT 4,
  quantity_unit TEXT NOT NULL DEFAULT 'servings',
  quantity_value2 NUMERIC(10,2),
  quantity_value3 NUMERIC(10,2),
  quantity_unit2 TEXT,
  prep_time INTEGER,
  cook_time INTEGER,
  cover_image_id UUID REFERENCES media(id) ON DELETE SET NULL,
  private BOOLEAN NOT NULL DEFAULT false,
  difficulty TEXT,
  forked_from_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  source_type TEXT,
  source_name TEXT,
  source_url TEXT,
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipes_household_id ON recipes(household_id);
CREATE INDEX idx_recipes_forked_from ON recipes(forked_from_id) WHERE forked_from_id IS NOT NULL;

-- recipe_ingredients
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(10,3),
  unit TEXT,
  key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- recipe_steps
CREATE TABLE recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- recipe_tools
CREATE TABLE recipe_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  usage_description TEXT,
  settings TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- recipe_references
CREATE TABLE recipe_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  referenced_recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(recipe_id, referenced_recipe_id),
  CHECK(recipe_id != referenced_recipe_id)
);

-- recipe_step_media
CREATE TABLE recipe_step_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- recipe_tags
CREATE TABLE recipe_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('meal_type', 'dietary')),
  tag_value TEXT NOT NULL,
  UNIQUE (recipe_id, tag_type, tag_value)
);

CREATE INDEX idx_recipe_tags_recipe_id ON recipe_tags(recipe_id);
CREATE INDEX idx_recipe_tags_type_value ON recipe_tags(tag_type, tag_value);

-- recipe_favorites (composite PK stays, both columns become UUID)
CREATE TABLE recipe_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX idx_recipe_favorites_user_id ON recipe_favorites(user_id);

-- recipe_drafts (already has UUID PK, but FK columns become UUID)
CREATE TABLE recipe_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipe_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_thinking TEXT,
  cover_image_id UUID REFERENCES media(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ocr', 'generate', 'url')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_drafts_household_id ON recipe_drafts(household_id);

-- shopping_lists
CREATE TABLE shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Shopping List',
  share_token TEXT UNIQUE,
  share_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_lists_household_id ON shopping_lists(household_id);

-- shopping_list_items
CREATE TABLE shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC,
  unit TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_list_items_list_id ON shopping_list_items(shopping_list_id);

-- pantry_items
CREATE TABLE pantry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(10, 3),
  unit TEXT,
  expires_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pantry_items_household ON pantry_items(household_id);
CREATE INDEX idx_pantry_items_ingredient ON pantry_items(ingredient_id);

-- ocr_usage
CREATE TABLE ocr_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ocr_usage_user_id ON ocr_usage(user_id);

-- push_subscriptions
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  key_p256dh TEXT NOT NULL,
  key_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_household ON push_subscriptions(household_id);

-- collections
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_id UUID REFERENCES media(id) ON DELETE SET NULL,
  private BOOLEAN NOT NULL DEFAULT false,
  share_token TEXT UNIQUE,
  share_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_household ON collections(household_id);

-- collection_recipes
CREATE TABLE collection_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection_id, recipe_id)
);

CREATE INDEX idx_collection_recipes_collection ON collection_recipes(collection_id);
CREATE INDEX idx_collection_recipes_recipe ON collection_recipes(recipe_id);

-- collection_shares
CREATE TABLE collection_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection_id, household_id)
);

CREATE INDEX idx_collection_shares_household ON collection_shares(household_id);
CREATE INDEX idx_collection_shares_collection ON collection_shares(collection_id);

-- ============================================================
-- 4. Recreate trigger functions and triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_recipe_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipe_search_update BEFORE INSERT OR UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_recipe_search_vector();

CREATE INDEX idx_recipes_search ON recipes USING GIN (search_vector);

CREATE OR REPLACE FUNCTION update_grocery_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.name, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ingredient_search_update BEFORE INSERT OR UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION update_grocery_search_vector();

CREATE INDEX idx_ingredients_search ON ingredients USING GIN (search_vector);
