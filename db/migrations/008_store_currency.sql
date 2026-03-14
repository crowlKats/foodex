DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'currency'
  ) THEN
    ALTER TABLE stores ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
  END IF;
END $$;
