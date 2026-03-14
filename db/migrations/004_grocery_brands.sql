DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groceries' AND column_name = 'brand'
  ) THEN
    ALTER TABLE groceries ADD COLUMN brand TEXT;
  END IF;
END $$;
