ALTER TABLE recipes
  ADD COLUMN output_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  ADD COLUMN output_amount NUMERIC,
  ADD COLUMN output_unit TEXT;
