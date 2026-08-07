-- Intermediate rows: products made and consumed inside the same recipe
-- (browned butter, burnt lemon juice, pasta cooking water). They keep a key,
-- an amount, and template refs so they scale and show in the ingredient list,
-- but they are not shoppable, never count against the pantry, and need no
-- ingredient library entity.

ALTER TABLE recipe_ingredients
  ADD COLUMN intermediate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN recipe_ingredients.intermediate IS
  'Made during this recipe (e.g. browned butter): scales and renders, but is '
  'not shoppable and does not need an ingredient entity.';

-- Migration 067 made ingredient_id NOT NULL; intermediates are the one case
-- with nothing sensible to link, so the invariant moves into a CHECK.
ALTER TABLE recipe_ingredients ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_link_or_intermediate
  CHECK (intermediate OR ingredient_id IS NOT NULL);
