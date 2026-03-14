CREATE TABLE IF NOT EXISTS store_locations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrate existing location data
INSERT INTO store_locations (store_id, address)
SELECT id, location FROM stores WHERE location IS NOT NULL AND location != '';

ALTER TABLE stores DROP COLUMN location;
