ALTER TABLE media ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;

-- Backfill from recipes that use media as cover images
UPDATE media m SET household_id = r.household_id
FROM recipes r
WHERE r.cover_image_id = m.id AND m.household_id IS NULL;

-- Backfill from recipe step media
UPDATE media m SET household_id = r.household_id
FROM recipe_step_media rsm
JOIN recipe_steps rs ON rs.id = rsm.step_id
JOIN recipes r ON r.id = rs.recipe_id
WHERE rsm.media_id = m.id AND m.household_id IS NULL;

-- Remove orphaned media that doesn't belong to any household
DELETE FROM media WHERE household_id IS NULL;

ALTER TABLE media ALTER COLUMN household_id SET NOT NULL;

CREATE INDEX idx_media_household_id ON media(household_id);
