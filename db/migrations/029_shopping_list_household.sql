ALTER TABLE shopping_lists ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;

UPDATE shopping_lists sl
SET household_id = hm.household_id
FROM household_members hm
WHERE hm.user_id = sl.user_id;

DELETE FROM shopping_lists WHERE household_id IS NULL;

ALTER TABLE shopping_lists ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE shopping_lists DROP COLUMN user_id;

DROP INDEX IF EXISTS idx_shopping_lists_user_id;
CREATE INDEX idx_shopping_lists_household_id ON shopping_lists(household_id);
