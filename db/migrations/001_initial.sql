CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_locations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groceries (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  unit TEXT NOT NULL,
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grocery_prices (
  id SERIAL PRIMARY KEY,
  grocery_id INTEGER NOT NULL REFERENCES groceries(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  amount NUMERIC(10,3),
  unit TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(grocery_id, store_id)
);

CREATE TABLE IF NOT EXISTS tools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
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
  cover_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  grocery_id INTEGER REFERENCES groceries(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(10,3),
  unit TEXT,
  key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_tools (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  usage_description TEXT,
  settings TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_references (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  referenced_recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(recipe_id, referenced_recipe_id),
  CHECK(recipe_id != referenced_recipe_id)
);

CREATE TABLE IF NOT EXISTS recipe_step_media (
  id SERIAL PRIMARY KEY,
  step_id INTEGER NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Search triggers
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
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.brand, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grocery_search_update BEFORE INSERT OR UPDATE ON groceries
  FOR EACH ROW EXECUTE FUNCTION update_grocery_search_vector();

CREATE INDEX idx_groceries_search ON groceries USING GIN (search_vector);
