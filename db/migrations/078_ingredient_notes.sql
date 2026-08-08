-- Per-line ingredient notes: short prep or usage hints that belong to the
-- recipe line, not the ingredient entity ("finely chopped", "room temperature",
-- "divided"). Free text, optional.

ALTER TABLE recipe_ingredients
  ADD COLUMN note TEXT;

COMMENT ON COLUMN recipe_ingredients.note IS
  'Optional prep/usage note for this line (e.g. finely chopped, room '
  'temperature). Belongs to the recipe line, not the ingredient entity.';
