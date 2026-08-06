-- Pantry and shopping list follow migration 067: everything that names an
-- ingredient links to a real ingredient entity.
--
-- pantry_items, shopping_list_demands and shopping_list_purchases become
-- NOT NULL — their write paths now find-or-create the entity up front
-- (lib/ingredient-resolve.ts). pantry_transactions stays nullable for one
-- reason: consumeStock's claim-marker row (source_seq 0, amount NULL) is a
-- synthetic idempotency token whose "name" is a note like "Consumption", not
-- an ingredient. Ledger rows get a best-effort link (no entity creation, so a
-- note text never becomes an ingredient), and every FK moves from SET NULL to
-- RESTRICT — deleting an ingredient must not silently unlink stock or history.

-- ── pantry_items ────────────────────────────────────────────────────

DELETE FROM pantry_items
WHERE ingredient_id IS NULL AND fx_norm_name(name) = '';

UPDATE pantry_items pi
SET ingredient_id = pick.id
FROM (
  SELECT DISTINCT ON (fx_norm_name(name)) fx_norm_name(name) AS norm, id
  FROM ingredients
  ORDER BY fx_norm_name(name), created_at, id
) pick
WHERE pi.ingredient_id IS NULL AND pick.norm = fx_norm_name(pi.name);

INSERT INTO ingredients (name, unit)
SELECT DISTINCT ON (fx_norm_name(name)) btrim(name), COALESCE(unit, '')
FROM pantry_items
WHERE ingredient_id IS NULL
ORDER BY fx_norm_name(name), id;

UPDATE pantry_items pi
SET ingredient_id = i.id
FROM ingredients i
WHERE pi.ingredient_id IS NULL
  AND fx_norm_name(i.name) = fx_norm_name(pi.name);

-- ── shopping_list_demands ───────────────────────────────────────────

DELETE FROM shopping_list_demands
WHERE ingredient_id IS NULL AND fx_norm_name(name) = '';

UPDATE shopping_list_demands d
SET ingredient_id = pick.id
FROM (
  SELECT DISTINCT ON (fx_norm_name(name)) fx_norm_name(name) AS norm, id
  FROM ingredients
  ORDER BY fx_norm_name(name), created_at, id
) pick
WHERE d.ingredient_id IS NULL AND pick.norm = fx_norm_name(d.name);

INSERT INTO ingredients (name, unit)
SELECT DISTINCT ON (fx_norm_name(name)) btrim(name), COALESCE(unit, '')
FROM shopping_list_demands
WHERE ingredient_id IS NULL
ORDER BY fx_norm_name(name), id;

UPDATE shopping_list_demands d
SET ingredient_id = i.id
FROM ingredients i
WHERE d.ingredient_id IS NULL
  AND fx_norm_name(i.name) = fx_norm_name(d.name);

-- ── shopping_list_purchases ─────────────────────────────────────────

DELETE FROM shopping_list_purchases
WHERE ingredient_id IS NULL AND fx_norm_name(name) = '';

UPDATE shopping_list_purchases p
SET ingredient_id = pick.id
FROM (
  SELECT DISTINCT ON (fx_norm_name(name)) fx_norm_name(name) AS norm, id
  FROM ingredients
  ORDER BY fx_norm_name(name), created_at, id
) pick
WHERE p.ingredient_id IS NULL AND pick.norm = fx_norm_name(p.name);

INSERT INTO ingredients (name, unit)
SELECT DISTINCT ON (fx_norm_name(name)) btrim(name), COALESCE(unit, '')
FROM shopping_list_purchases
WHERE ingredient_id IS NULL
ORDER BY fx_norm_name(name), id;

UPDATE shopping_list_purchases p
SET ingredient_id = i.id
FROM ingredients i
WHERE p.ingredient_id IS NULL
  AND fx_norm_name(i.name) = fx_norm_name(p.name);

-- Purchases match projected lines by match_key. Now that every demand and
-- recipe line is id-linked, projected keys are always 'id:<uuid>' — purchases
-- recorded under a 'name:…' key (or a stale id) would stop matching and their
-- lines would reappear as unbought. Re-key them, skipping any that would
-- collide with an existing purchase on UNIQUE (shopping_list_id, match_key);
-- the skipped leftovers are duplicates of that purchase and are dropped.
UPDATE shopping_list_purchases p
SET match_key = 'id:' || p.ingredient_id::text
WHERE p.match_key <> 'id:' || p.ingredient_id::text
  AND NOT EXISTS (
    SELECT 1 FROM shopping_list_purchases o
    WHERE o.shopping_list_id = p.shopping_list_id
      AND o.match_key = 'id:' || p.ingredient_id::text
  );

DELETE FROM shopping_list_purchases
WHERE match_key <> 'id:' || ingredient_id::text;

-- ── pantry_transactions: best-effort link, stays nullable ───────────

UPDATE pantry_transactions pt
SET ingredient_id = pick.id
FROM (
  SELECT DISTINCT ON (fx_norm_name(name)) fx_norm_name(name) AS norm, id
  FROM ingredients
  ORDER BY fx_norm_name(name), created_at, id
) pick
WHERE pt.ingredient_id IS NULL AND pick.norm = fx_norm_name(pt.name);

COMMENT ON COLUMN pantry_transactions.ingredient_id IS
  'Null only on rows that are not stock movements (consumption claim markers).';

-- ── Enforce ─────────────────────────────────────────────────────────

ALTER TABLE pantry_items ALTER COLUMN ingredient_id SET NOT NULL;
ALTER TABLE shopping_list_demands ALTER COLUMN ingredient_id SET NOT NULL;
ALTER TABLE shopping_list_purchases ALTER COLUMN ingredient_id SET NOT NULL;

ALTER TABLE pantry_items
  DROP CONSTRAINT pantry_items_ingredient_id_fkey,
  ADD CONSTRAINT pantry_items_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT;

ALTER TABLE shopping_list_demands
  DROP CONSTRAINT shopping_list_demands_ingredient_id_fkey,
  ADD CONSTRAINT shopping_list_demands_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT;

ALTER TABLE shopping_list_purchases
  DROP CONSTRAINT shopping_list_purchases_ingredient_id_fkey,
  ADD CONSTRAINT shopping_list_purchases_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT;

-- History too: a SET NULL here would resurface as a NOT NULL violation the
-- next time reverseSource re-creates the pantry row a cook emptied.
ALTER TABLE pantry_transactions
  DROP CONSTRAINT pantry_transactions_ingredient_id_fkey,
  ADD CONSTRAINT pantry_transactions_ingredient_id_fkey
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT;
