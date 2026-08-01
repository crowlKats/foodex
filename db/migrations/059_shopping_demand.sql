-- The shopping list stops being a bag of snapshots and becomes a projection:
--
--   list = (planned meals + manual demands) − pantry stock − already bought
--
-- computed at read time. Change the servings on a planned meal, buy some flour,
-- or add the same recipe twice, and the list follows. Under the old model each
-- of those left rows that were silently wrong with no way to recompute them.

-- SQL mirror of normalizeName() in lib/inventory.ts.
CREATE OR REPLACE FUNCTION fx_norm_name(p_name TEXT) RETURNS TEXT AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
$$ LANGUAGE sql IMMUTABLE;

-- SQL mirror of matchKey() in lib/inventory.ts: the identity of a projected
-- line. A linked ingredient keys on its id, everything else on its name.
CREATE OR REPLACE FUNCTION fx_match_key(p_ingredient_id UUID, p_name TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN p_ingredient_id IS NOT NULL THEN 'id:' || p_ingredient_id::text
    ELSE 'name:' || fx_norm_name(p_name)
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Manual "we need milk" entries. Recipe demand comes from plan_entries.
CREATE TABLE shopping_list_demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12, 3),
  unit TEXT,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopping_list_demands_list
  ON shopping_list_demands (shopping_list_id);

-- Ticking a line off is a purchase, not a flag: it is the record that stock
-- entered the house. `match_key` mirrors matchKey() in lib/inventory.ts, which
-- is what ties a purchase back to a line the projection recomputes every load.
CREATE TABLE shopping_list_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  match_key TEXT NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12, 3),
  unit TEXT,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  price NUMERIC(12, 4),
  expires_at DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shopping_list_id, match_key)
);

CREATE INDEX idx_shopping_list_purchases_list
  ON shopping_list_purchases (shopping_list_id);

-- Where the household actually buys a thing. Previously the store dropdown
-- re-derived the cheapest option on every render and forgot any manual choice.
CREATE TABLE household_ingredient_stores (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, ingredient_id)
);

-- ── Migrate existing lists ────────────────────────────────────────────────
-- Outstanding items become manual demands. Their recipe attribution is dropped
-- rather than guessed at: the old rows stored pantry-adjusted amounts with no
-- record of the scale they were computed at, so there is no faithful way to
-- turn them back into planned meals. Checked items are discarded — they were
-- already added to the pantry when they were ticked off.
WITH current_list AS (
  SELECT DISTINCT ON (household_id) household_id, id
  FROM shopping_lists
  ORDER BY household_id, created_at DESC, id DESC
)
INSERT INTO shopping_list_demands (
  shopping_list_id, ingredient_id, name, amount, unit, note, created_at
)
SELECT
  cl.id, sli.ingredient_id, sli.name, sli.amount, sli.unit,
  CASE WHEN r.title IS NOT NULL THEN 'Was listed for ' || r.title END,
  sli.created_at
FROM shopping_list_items sli
JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
JOIN current_list cl ON cl.household_id = sl.household_id
LEFT JOIN recipes r ON r.id = sli.recipe_id
WHERE sli.checked = false;

-- One list per household. The schema allowed many; getOrCreateList silently
-- picked the newest, so the others were unreachable rows.
DELETE FROM shopping_lists sl
WHERE EXISTS (
  SELECT 1 FROM shopping_lists newer
  WHERE newer.household_id = sl.household_id
    AND (newer.created_at, newer.id) > (sl.created_at, sl.id)
);

ALTER TABLE shopping_lists ADD CONSTRAINT shopping_lists_household_unique
  UNIQUE (household_id);

-- `name` was never read or written by anything.
ALTER TABLE shopping_lists DROP COLUMN name;

DROP TABLE shopping_list_items;
