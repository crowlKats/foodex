-- Tools and stores are global, not household-owned.
-- Households select which tools/stores they use via junction tables.

-- Create household junction tables
CREATE TABLE household_tools (
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, tool_id)
);

CREATE TABLE household_stores (
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, store_id)
);

-- Migrate existing household_id associations to junction tables
INSERT INTO household_tools (household_id, tool_id)
SELECT household_id, id FROM tools WHERE household_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO household_stores (household_id, store_id)
SELECT household_id, id FROM stores WHERE household_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop household_id from tools and stores
DROP INDEX IF EXISTS idx_tools_household_id;
DROP INDEX IF EXISTS idx_stores_household_id;
ALTER TABLE tools DROP COLUMN household_id;
ALTER TABLE stores DROP COLUMN household_id;
