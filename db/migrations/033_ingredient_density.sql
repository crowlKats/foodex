-- Per-ingredient density (g/ml) to allow mass↔volume conversion.
-- e.g. flour ≈ 0.59, honey ≈ 1.42, water = 1.0
ALTER TABLE ingredients ADD COLUMN density double precision;
