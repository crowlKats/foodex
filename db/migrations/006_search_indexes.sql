ALTER TABLE recipes ADD COLUMN search_vector tsvector;

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

ALTER TABLE groceries ADD COLUMN search_vector tsvector;

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

-- Backfill existing rows
UPDATE recipes SET title = title;
UPDATE groceries SET name = name;
