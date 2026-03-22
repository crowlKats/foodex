CREATE TABLE collections (
  id SERIAL PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  private BOOLEAN NOT NULL DEFAULT false,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_household ON collections(household_id);

CREATE TABLE collection_recipes (
  id SERIAL PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection_id, recipe_id)
);

CREATE INDEX idx_collection_recipes_collection ON collection_recipes(collection_id);
CREATE INDEX idx_collection_recipes_recipe ON collection_recipes(recipe_id);

CREATE TABLE collection_shares (
  id SERIAL PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  shared_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collection_id, household_id)
);

CREATE INDEX idx_collection_shares_household ON collection_shares(household_id);
CREATE INDEX idx_collection_shares_collection ON collection_shares(collection_id);
