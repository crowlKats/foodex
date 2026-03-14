-- Replace fixed servings with flexible quantity types
-- quantity_type: 'servings', 'weight', 'volume', 'dimensions'
-- quantity_value: primary numeric value (servings count, grams, ml)
-- quantity_unit: unit string ('servings', 'g', 'kg', 'ml', 'l')
-- quantity_value2: secondary value for dimensions (height/y)
-- quantity_unit2: secondary unit for dimensions (always 'cm' for now)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'quantity_type'
  ) THEN
    ALTER TABLE recipes ADD COLUMN quantity_type TEXT NOT NULL DEFAULT 'servings';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'quantity_value'
  ) THEN
    ALTER TABLE recipes ADD COLUMN quantity_value NUMERIC(10,2) NOT NULL DEFAULT 4;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'quantity_unit'
  ) THEN
    ALTER TABLE recipes ADD COLUMN quantity_unit TEXT NOT NULL DEFAULT 'servings';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'quantity_value2'
  ) THEN
    ALTER TABLE recipes ADD COLUMN quantity_value2 NUMERIC(10,2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'quantity_unit2'
  ) THEN
    ALTER TABLE recipes ADD COLUMN quantity_unit2 TEXT;
  END IF;
END $$;

-- Migrate existing data and drop old column
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'default_servings'
  ) THEN
    EXECUTE 'UPDATE recipes SET quantity_value = default_servings, quantity_type = ''servings'', quantity_unit = ''servings''';
    ALTER TABLE recipes DROP COLUMN default_servings;
  END IF;
END $$;
