-- Cuisine joins meal type and dietary as a third tag family so the recipe
-- list can filter by it. Same table, same shape; only the allowed types grow.
ALTER TABLE recipe_tags DROP CONSTRAINT recipe_tags_tag_type_check;
ALTER TABLE recipe_tags ADD CONSTRAINT recipe_tags_tag_type_check
  CHECK (tag_type IN ('meal_type', 'dietary', 'cuisine'));
