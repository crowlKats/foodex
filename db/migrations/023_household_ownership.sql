-- Tools, stores, and recipes belong to households instead of users

-- Add household_id to tools and stores
ALTER TABLE tools ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE stores ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;

-- Add household_id to recipes, migrate from user_id
ALTER TABLE recipes ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE CASCADE;
UPDATE recipes r SET household_id = (
  SELECT hm.household_id FROM household_members hm WHERE hm.user_id = r.user_id LIMIT 1
) WHERE r.user_id IS NOT NULL;
ALTER TABLE recipes DROP COLUMN user_id;

-- Migrate tools ownership from user_tools
UPDATE tools t SET household_id = (
  SELECT hm.household_id FROM user_tools ut
  JOIN household_members hm ON hm.user_id = ut.user_id
  WHERE ut.tool_id = t.id LIMIT 1
);

-- Migrate stores ownership from user_stores
UPDATE stores s SET household_id = (
  SELECT hm.household_id FROM user_stores us
  JOIN household_members hm ON hm.user_id = us.user_id
  WHERE us.store_id = s.id LIMIT 1
);

-- Drop junction tables
DROP TABLE IF EXISTS user_tools;
DROP TABLE IF EXISTS user_stores;

-- Add indexes
CREATE INDEX idx_tools_household_id ON tools(household_id);
CREATE INDEX idx_stores_household_id ON stores(household_id);
CREATE INDEX idx_recipes_household_id ON recipes(household_id);
