CREATE TABLE IF NOT EXISTS ingredient_brands (
  id SERIAL PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrate existing brand data from ingredients table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'brand'
  ) THEN
    EXECUTE 'INSERT INTO ingredient_brands (ingredient_id, brand) SELECT id, brand FROM ingredients WHERE brand IS NOT NULL AND brand != ''''';
    ALTER TABLE ingredients DROP COLUMN brand;
  END IF;
END $$;

-- Prices now link to a brand instead of directly to an ingredient
-- Add brand_id to ingredient_prices, make ingredient_id nullable (kept for backwards compat)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredient_prices' AND column_name = 'brand_id'
  ) THEN
    ALTER TABLE ingredient_prices ADD COLUMN brand_id INTEGER REFERENCES ingredient_brands(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update search vector to remove brand (now in separate table)
CREATE OR REPLACE FUNCTION update_grocery_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.name, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE ingredients SET name = name;
