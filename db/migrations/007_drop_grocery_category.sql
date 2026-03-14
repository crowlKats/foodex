DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groceries' AND column_name = 'category'
  ) THEN
    ALTER TABLE groceries DROP COLUMN category;
  END IF;
END $$;

-- Update search vector function to remove category
CREATE OR REPLACE FUNCTION update_grocery_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.brand, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE groceries SET name = name;
