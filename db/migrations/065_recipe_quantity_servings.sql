-- A tray (dimensions) recipe often also states a yield in pieces/servings
-- ("20x30 cm tray, makes 15"). The tray stays the scaling quantity; this
-- records the servings mark alongside it, captured at import/edit time.
ALTER TABLE recipes ADD COLUMN quantity_servings integer;
