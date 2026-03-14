DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'quantity_value3'
  ) THEN
    ALTER TABLE recipes ADD COLUMN quantity_value3 NUMERIC(10,2);
  END IF;
END $$;
