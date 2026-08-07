-- Splitting a dish back out. fx_resolve_dish honors aliases before anything
-- else (that is what makes merges permanent), but it also means a
-- merged-away name can never become its own dish again through resolution
-- alone. The 062 backfill unioned fork families on the assumption that a
-- renamed fork still makes its root's dish, which is wrong whenever the
-- rename *is* the point (lime curd forked from lemon curd). fx_dish_create
-- is the explicit counterpart: the name's own dish wins, the alias is
-- repointed to it, and titles that match follow.

CREATE OR REPLACE FUNCTION fx_dish_create(p_name TEXT) RETURNS UUID AS $$
DECLARE
  v_norm TEXT := fx_norm_name(p_name);
  v_id UUID;
  v_base TEXT;
  v_slug TEXT;
  v_n INTEGER := 1;
BEGIN
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM dishes WHERE fx_norm_name(name) = v_norm;

  IF v_id IS NULL THEN
    v_base := fx_dish_slug_base(p_name);
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM dishes WHERE slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;
    INSERT INTO dishes (name, slug) VALUES (btrim(p_name), v_slug)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM dishes WHERE fx_norm_name(name) = v_norm;
    END IF;
  END IF;

  -- Repoint the alias even if a merge had claimed it, so future recipes
  -- with this title resolve here instead of the merge target.
  INSERT INTO dish_aliases (dish_id, norm_name) VALUES (v_id, v_norm)
    ON CONFLICT (norm_name) DO UPDATE SET dish_id = EXCLUDED.dish_id;

  -- Auto-tracked recipes with this exact title follow the repointed alias,
  -- exactly as if each had been re-saved. Manual pins stay where they are.
  UPDATE recipes SET dish_id = v_id
  WHERE fx_norm_name(title) = v_norm
    AND NOT dish_manual
    AND dish_id IS DISTINCT FROM v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
