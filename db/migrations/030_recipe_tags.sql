CREATE TABLE recipe_tags (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('meal_type', 'dietary')),
  tag_value TEXT NOT NULL,
  UNIQUE (recipe_id, tag_type, tag_value)
);

CREATE INDEX idx_recipe_tags_recipe_id ON recipe_tags(recipe_id);
CREATE INDEX idx_recipe_tags_type_value ON recipe_tags(tag_type, tag_value);
