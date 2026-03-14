DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'groceries')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ingredients')
  THEN
    ALTER TABLE groceries RENAME TO ingredients;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'groceries_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ingredients_id_seq')
  THEN
    ALTER SEQUENCE groceries_id_seq RENAME TO ingredients_id_seq;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grocery_prices')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ingredient_prices')
  THEN
    ALTER TABLE grocery_prices RENAME TO ingredient_prices;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'grocery_prices_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ingredient_prices_id_seq')
  THEN
    ALTER SEQUENCE grocery_prices_id_seq RENAME TO ingredient_prices_id_seq;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredient_prices' AND column_name = 'grocery_id'
  ) THEN
    ALTER TABLE ingredient_prices RENAME COLUMN grocery_id TO ingredient_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_ingredients' AND column_name = 'grocery_id'
  ) THEN
    ALTER TABLE recipe_ingredients RENAME COLUMN grocery_id TO ingredient_id;
  END IF;
END $$;

-- Update search function
CREATE OR REPLACE FUNCTION update_grocery_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.brand, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
