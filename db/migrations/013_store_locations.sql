CREATE TABLE IF NOT EXISTS store_locations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrate existing location data
INSERT INTO store_locations (store_id, address)
SELECT id, location FROM stores
WHERE location IS NOT NULL AND location != ''
  AND NOT EXISTS (SELECT 1 FROM store_locations sl WHERE sl.store_id = stores.id);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'location'
  ) THEN
    ALTER TABLE stores DROP COLUMN location;
  END IF;
END $$;
