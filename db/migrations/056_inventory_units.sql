-- SQL mirror of lib/unit-convert.ts, so filters that must run in the database
-- (the "cookable" recipe filter, shopping-list projections) answer availability
-- the same way lib/inventory.ts does in TypeScript.
--
-- Keep the factors below in sync with the CONVERSIONS table in
-- lib/unit-convert.ts. Count units (pcs, clove, ...) and unknown units are
-- their own base and only ever compare against themselves.

CREATE OR REPLACE FUNCTION fx_base_unit(u TEXT) RETURNS TEXT AS $$
  SELECT CASE lower(coalesce(u, ''))
    WHEN 'g' THEN 'g'
    WHEN 'kg' THEN 'g'
    WHEN 'mg' THEN 'g'
    WHEN 'oz' THEN 'g'
    WHEN 'lb' THEN 'g'
    WHEN 'ml' THEN 'ml'
    WHEN 'l' THEN 'ml'
    WHEN 'cl' THEN 'ml'
    WHEN 'dl' THEN 'ml'
    WHEN 'fl oz' THEN 'ml'
    WHEN 'cup' THEN 'ml'
    WHEN 'tbsp' THEN 'ml'
    WHEN 'tsp' THEN 'ml'
    WHEN 'mm' THEN 'mm'
    WHEN 'cm' THEN 'mm'
    WHEN 'inch' THEN 'mm'
    ELSE lower(coalesce(u, ''))
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fx_base_amount(amount NUMERIC, u TEXT) RETURNS NUMERIC AS $$
  SELECT amount * CASE lower(coalesce(u, ''))
    WHEN 'kg' THEN 1000
    WHEN 'mg' THEN 0.001
    WHEN 'oz' THEN 28.3495
    WHEN 'lb' THEN 453.592
    WHEN 'l' THEN 1000
    WHEN 'cl' THEN 10
    WHEN 'dl' THEN 100
    WHEN 'fl oz' THEN 29.5735
    WHEN 'cup' THEN 236.588
    WHEN 'tbsp' THEN 14.787
    WHEN 'tsp' THEN 4.929
    WHEN 'cm' THEN 10
    WHEN 'inch' THEN 25.4
    ELSE 1
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Convert between units, bridging mass↔volume with density (g/ml).
-- NULL means "not comparable"; callers must not treat that as zero.
--
-- `density` is DOUBLE PRECISION to match ingredients.density; Postgres will not
-- implicitly narrow float8 to numeric when resolving the call.
CREATE OR REPLACE FUNCTION fx_convert(
  amount NUMERIC,
  from_unit TEXT,
  to_unit TEXT,
  density DOUBLE PRECISION DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  from_base TEXT;
  to_base TEXT;
  in_base NUMERIC;
  unit_size NUMERIC;
BEGIN
  IF amount IS NULL THEN RETURN NULL; END IF;
  IF lower(coalesce(from_unit, '')) = lower(coalesce(to_unit, '')) THEN
    RETURN amount;
  END IF;

  from_base := fx_base_unit(from_unit);
  to_base := fx_base_unit(to_unit);
  in_base := fx_base_amount(amount, from_unit);
  unit_size := fx_base_amount(1, to_unit);
  IF unit_size IS NULL OR unit_size = 0 THEN RETURN NULL; END IF;

  IF from_base = to_base THEN
    RETURN in_base / unit_size;
  END IF;

  IF density IS NULL OR density <= 0 THEN RETURN NULL; END IF;
  IF from_base = 'ml' AND to_base = 'g' THEN
    RETURN (in_base * density::numeric) / unit_size;
  END IF;
  IF from_base = 'g' AND to_base = 'ml' THEN
    RETURN (in_base / density::numeric) / unit_size;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
