-- "Always on hand" moves from the recipe line to the ingredient itself.
--
-- Whether water or salt is something you shop for is a property of the
-- ingredient, not of any one recipe. Flagging it per recipe meant every
-- author repeated the same decision on every recipe, and paths that rebuilt
-- recipe lines wholesale (agent edits, clones) silently dropped the flag.

ALTER TABLE ingredients
  ADD COLUMN always_on_hand BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ingredients.always_on_hand IS
  'Scales with recipes but is never bought or counted as missing.';

-- Flagged lines that were never linked to a global ingredient (water usually
-- wasn't) get one now, so the flag has somewhere to live.
INSERT INTO ingredients (name, unit)
SELECT DISTINCT ON (lower(trim(ri.name))) trim(ri.name), COALESCE(ri.unit, '')
FROM recipe_ingredients ri
WHERE ri.always_on_hand
  AND ri.ingredient_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM ingredients i WHERE lower(i.name) = lower(trim(ri.name))
  );

UPDATE recipe_ingredients ri
SET ingredient_id = i.id
FROM ingredients i
WHERE ri.always_on_hand
  AND ri.ingredient_id IS NULL
  AND lower(i.name) = lower(trim(ri.name));

UPDATE ingredients i
SET always_on_hand = true
WHERE EXISTS (
  SELECT 1 FROM recipe_ingredients ri
  WHERE ri.ingredient_id = i.id AND ri.always_on_hand
);

ALTER TABLE recipe_ingredients DROP COLUMN always_on_hand;
