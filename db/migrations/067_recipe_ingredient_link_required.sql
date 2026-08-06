-- Every recipe line must reference a real ingredient entity.
--
-- ingredient_id has been nullable since day one, so imports, free text on the
-- recipe form, and deleting an ingredient (ON DELETE SET NULL) all left lines
-- that carried nothing but a raw name. Such a line can never be always-on-hand,
-- never carries a price, and only matches pantry stock by fragile name
-- equality. Write paths now find-or-create the entity up front
-- (lib/ingredient-resolve.ts), so the column can require it.

-- Unlinked lines with a blank name have no identity to attach; drop them.
DELETE FROM recipe_ingredients
WHERE ingredient_id IS NULL AND fx_norm_name(name) = '';

-- Link to an existing ingredient with the same normalized name. When several
-- entities share a name, prefer the oldest — the same pick a merge would make.
UPDATE recipe_ingredients ri
SET ingredient_id = pick.id
FROM (
  SELECT DISTINCT ON (fx_norm_name(name)) fx_norm_name(name) AS norm, id
  FROM ingredients
  ORDER BY fx_norm_name(name), created_at, id
) pick
WHERE ri.ingredient_id IS NULL AND pick.norm = fx_norm_name(ri.name);

-- Names with no entity anywhere get one, seeded with the line's unit
-- (the same shape migration 066 used for always-on-hand backfill).
INSERT INTO ingredients (name, unit)
SELECT DISTINCT ON (fx_norm_name(ri.name)) btrim(ri.name), COALESCE(ri.unit, '')
FROM recipe_ingredients ri
WHERE ri.ingredient_id IS NULL
ORDER BY fx_norm_name(ri.name), ri.id;

-- Only the just-created entities can match here: any name with a pre-existing
-- entity was already linked above.
UPDATE recipe_ingredients ri
SET ingredient_id = i.id
FROM ingredients i
WHERE ri.ingredient_id IS NULL
  AND fx_norm_name(i.name) = fx_norm_name(ri.name);

ALTER TABLE recipe_ingredients ALTER COLUMN ingredient_id SET NOT NULL;

-- SET NULL is impossible on a NOT NULL column: deleting an ingredient that
-- recipes still use is now blocked — merge it into another instead.
ALTER TABLE recipe_ingredients
  DROP CONSTRAINT recipe_ingredients_ingredient_id_fkey,
  ADD CONSTRAINT recipe_ingredients_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT;
