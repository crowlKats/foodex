-- Some ingredients are measured but never shopped for.
--
-- Water is the obvious one: it's in a large share of recipes and it has to
-- scale with them, but the only way to make `600ml water` scale was to declare
-- it as an ingredient — which then put water on the shopping list and counted
-- it as missing from the pantry. The same applies to ice, and to salt or oil
-- depending on how the author thinks about staples.
--
-- This flag keeps such a line in the recipe for scaling and `{{ }}` templating
-- while excluding it from the shopping-list projection and the pantry
-- shortfall. It's the recipe-side counterpart of `pantry_items.staple`.
ALTER TABLE recipe_ingredients
  ADD COLUMN always_on_hand BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN recipe_ingredients.always_on_hand IS
  'Scales with the recipe but is never bought or counted as missing.';
