-- Plan by dish: a plan entry may name a dish ("Carbonara on Thursday") and
-- defer the recipe choice to cook time. Until a recipe is pinned the entry
-- contributes nothing to the shopping list (every demand reader inner-joins
-- on recipe_id, so unpinned entries drop out on their own): speculative
-- ingredients from an unchosen variant must never be bought.
--
-- target_servings carries the intent for dish entries; scale stays relative
-- to the pinned recipe's own base quantity and is derived when pinning.
ALTER TABLE plan_entries
  ADD COLUMN dish_id UUID REFERENCES dishes(id) ON DELETE SET NULL,
  ADD COLUMN target_servings NUMERIC(10,2) CHECK (target_servings > 0),
  ALTER COLUMN recipe_id DROP NOT NULL;

ALTER TABLE plan_entries
  ADD CONSTRAINT plan_entries_has_target
  CHECK (recipe_id IS NOT NULL OR dish_id IS NOT NULL);

CREATE INDEX idx_plan_entries_dish ON plan_entries (dish_id)
  WHERE dish_id IS NOT NULL;
