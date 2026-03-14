-- Add key column to recipe_ingredients for template variable names
ALTER TABLE recipe_ingredients ADD COLUMN key TEXT;

-- Create recipe_sections table (replaces recipes.body)
CREATE TABLE IF NOT EXISTS recipe_sections (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Migrate existing recipe bodies into a single section per recipe
INSERT INTO recipe_sections (recipe_id, title, body, sort_order)
SELECT id, 'Instructions', body, 0
FROM recipes
WHERE body IS NOT NULL AND body != '';

-- Drop body column from recipes
ALTER TABLE recipes DROP COLUMN body;
