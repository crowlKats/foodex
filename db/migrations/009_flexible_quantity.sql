-- Replace fixed servings with flexible quantity types
-- quantity_type: 'servings', 'weight', 'volume', 'dimensions'
-- quantity_value: primary numeric value (servings count, grams, ml)
-- quantity_unit: unit string ('servings', 'g', 'kg', 'ml', 'l')
-- quantity_value2: secondary value for dimensions (height/y)
-- quantity_unit2: secondary unit for dimensions (always 'cm' for now)

ALTER TABLE recipes ADD COLUMN quantity_type TEXT NOT NULL DEFAULT 'servings';
ALTER TABLE recipes ADD COLUMN quantity_value NUMERIC(10,2) NOT NULL DEFAULT 4;
ALTER TABLE recipes ADD COLUMN quantity_unit TEXT NOT NULL DEFAULT 'servings';
ALTER TABLE recipes ADD COLUMN quantity_value2 NUMERIC(10,2);
ALTER TABLE recipes ADD COLUMN quantity_unit2 TEXT;

-- Migrate existing data
UPDATE recipes SET quantity_value = default_servings, quantity_type = 'servings', quantity_unit = 'servings';

ALTER TABLE recipes DROP COLUMN default_servings;
