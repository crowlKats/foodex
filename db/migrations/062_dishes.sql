-- Dish identity: recipes that make the same dish share a dishes row.
--
-- A dish is the title-equivalence class of recipes, reified. Resolution is
-- automatic: a trigger derives the dish from the recipe title via
-- fx_norm_name, creating the dish on first use. dish_aliases records every
-- normalized name that resolves to a dish, so merging "Spaghetti alla
-- Carbonara" into "Carbonara" is curated once and every future recipe with
-- either title lands in the merged dish.
--
-- Dish identity is orthogonal to output_ingredient_id: dish_id says what a
-- recipe *is*, output_ingredient_id says what pantry-stockable thing it
-- *yields*. Neither implies the other.

CREATE TABLE dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_dishes_norm_name ON dishes (fx_norm_name(name));

-- Every normalized name that resolves to a dish. The dish's own name is also
-- an alias row, so resolution is a single lookup. Aliases survive dish merges
-- (unlike ingredient merges, which delete the loser outright) — that is what
-- makes convergence stick.
CREATE TABLE dish_aliases (
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  norm_name TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_dish_aliases_dish ON dish_aliases (dish_id);

-- dish_manual marks a user's explicit dish choice; the trigger then leaves
-- dish_id alone even when the title changes.
ALTER TABLE recipes
  ADD COLUMN dish_id UUID REFERENCES dishes(id) ON DELETE SET NULL,
  ADD COLUMN dish_manual BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_recipes_dish ON recipes (dish_id);

-- Slug base for a dish name. No unaccent extension is available, so accented
-- characters are dropped by the [^a-z0-9] strip rather than transliterated;
-- uniqueness is handled by the suffix loop in fx_resolve_dish.
CREATE OR REPLACE FUNCTION fx_dish_slug_base(p_name TEXT) RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(
      regexp_replace(
        regexp_replace(fx_norm_name(p_name), '[^a-z0-9]+', '-', 'g'),
        '^-+|-+$', '', 'g'
      ),
    ''),
    'dish'
  );
$$ LANGUAGE sql IMMUTABLE;

-- Resolve a recipe title to a dish id, creating the dish (and its alias) on
-- first use. Races on concurrent creation are absorbed by the ON CONFLICT
-- clauses; a lost race can strand an empty dishes row, which is harmless —
-- dishes with no recipes are never rendered.
CREATE OR REPLACE FUNCTION fx_resolve_dish(p_title TEXT) RETURNS UUID AS $$
DECLARE
  v_norm TEXT := fx_norm_name(p_title);
  v_id UUID;
  v_base TEXT;
  v_slug TEXT;
  v_n INTEGER := 1;
BEGIN
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  SELECT dish_id INTO v_id FROM dish_aliases WHERE norm_name = v_norm;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- A dish may exist whose own name normalizes to this without an alias row
  -- (defensive; should not happen in practice).
  SELECT id INTO v_id FROM dishes WHERE fx_norm_name(name) = v_norm;

  IF v_id IS NULL THEN
    v_base := fx_dish_slug_base(p_title);
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM dishes WHERE slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;
    INSERT INTO dishes (name, slug) VALUES (btrim(p_title), v_slug)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM dishes WHERE fx_norm_name(name) = v_norm;
    END IF;
  END IF;

  INSERT INTO dish_aliases (dish_id, norm_name) VALUES (v_id, v_norm)
    ON CONFLICT (norm_name) DO NOTHING;
  -- If the alias insert conflicted, another transaction won; its dish wins.
  SELECT dish_id INTO v_id FROM dish_aliases WHERE norm_name = v_norm;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Keep dish_id in sync with the title on every write path (there are five
-- independent INSERT INTO recipes sites; a trigger cannot be forgotten).
-- An INSERT that already carries a dish_id (clone preserving a manual choice)
-- is trusted as-is.
CREATE OR REPLACE FUNCTION update_recipe_dish() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.dish_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.dish_manual THEN
      RETURN NEW;
    END IF;
    IF NEW.dish_id IS NOT NULL AND NEW.title = OLD.title THEN
      RETURN NEW;
    END IF;
  END IF;
  NEW.dish_id := fx_resolve_dish(NEW.title);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipe_dish_update BEFORE INSERT OR UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_recipe_dish();

-- ── Backfill ────────────────────────────────────────────────────────

-- One dish per distinct normalized title, named after the oldest recipe.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (fx_norm_name(title)) title
    FROM recipes
    WHERE fx_norm_name(title) <> ''
    ORDER BY fx_norm_name(title), created_at
  LOOP
    PERFORM fx_resolve_dish(r.title);
  END LOOP;
END $$;

UPDATE recipes r SET dish_id = da.dish_id
FROM dish_aliases da
WHERE da.norm_name = fx_norm_name(r.title) AND r.dish_id IS NULL;

-- Union fork families: a fork that was renamed still makes its root's dish.
-- Merging moves the fork's whole title-class (and its aliases) into the
-- root's dish, so the renamed title keeps resolving there for future
-- recipes. One merge per iteration, re-queried, so chained merges never
-- repoint at a deleted dish.
DO $$
DECLARE
  v_from UUID;
  v_to UUID;
BEGIN
  LOOP
    SELECT f.dish_id, root.dish_id INTO v_from, v_to
    FROM recipes f
    JOIN recipes root ON root.id = f.forked_from_id
    WHERE f.dish_id IS NOT NULL AND root.dish_id IS NOT NULL
      AND f.dish_id <> root.dish_id
    LIMIT 1;
    EXIT WHEN NOT FOUND;
    UPDATE recipes SET dish_id = v_to WHERE dish_id = v_from;
    UPDATE dish_aliases SET dish_id = v_to WHERE dish_id = v_from;
    DELETE FROM dishes WHERE id = v_from;
  END LOOP;
END $$;
