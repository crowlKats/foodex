DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE recipes ADD COLUMN search_vector tsvector;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_recipe_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'recipe_search_update'
  ) THEN
    CREATE TRIGGER recipe_search_update BEFORE INSERT OR UPDATE ON recipes
      FOR EACH ROW EXECUTE FUNCTION update_recipe_search_vector();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recipes_search ON recipes USING GIN (search_vector);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groceries' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE groceries ADD COLUMN search_vector tsvector;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_grocery_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.brand, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'grocery_search_update'
  ) THEN
    CREATE TRIGGER grocery_search_update BEFORE INSERT OR UPDATE ON groceries
      FOR EACH ROW EXECUTE FUNCTION update_grocery_search_vector();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_groceries_search ON groceries USING GIN (search_vector);

-- Backfill existing rows
UPDATE recipes SET title = title;
UPDATE groceries SET name = name;
