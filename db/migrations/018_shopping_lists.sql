CREATE TABLE shopping_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Shopping List',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_lists_user_id ON shopping_lists(user_id);

CREATE TABLE shopping_list_items (
  id SERIAL PRIMARY KEY,
  shopping_list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC,
  unit TEXT,
  store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_list_items_list_id ON shopping_list_items(shopping_list_id);
