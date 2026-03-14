-- Add key column to recipe_ingredients for template variable names
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_ingredients' AND column_name = 'key'
  ) THEN
    ALTER TABLE recipe_ingredients ADD COLUMN key TEXT;
  END IF;
END $$;

-- Create recipe_sections table (replaces recipes.body)
CREATE TABLE IF NOT EXISTS recipe_sections (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Migrate existing recipe bodies into a single section per recipe
-- Only runs if the body column still exists on recipes
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'body'
  ) THEN
    INSERT INTO recipe_sections (recipe_id, title, body, sort_order)
    SELECT id, 'Instructions', body, 0
    FROM recipes
    WHERE body IS NOT NULL AND body != ''
      AND NOT EXISTS (SELECT 1 FROM recipe_sections rs WHERE rs.recipe_id = recipes.id);

    ALTER TABLE recipes DROP COLUMN body;
  END IF;
END $$;
