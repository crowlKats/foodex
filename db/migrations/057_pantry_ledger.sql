-- Stock becomes a ledger. `pantry_items` stays as the current balance (every
-- read path already depends on it), but it is now derived: nothing writes to it
-- except lib/pantry.ts, which records the reason for the change here first.
--
-- This is what makes buying idempotent. Checking an item off the shopping list
-- writes a transaction keyed to that list line, so re-checking is a no-op and
-- un-checking reverses the exact amount that was added.

ALTER TABLE pantry_items
  ADD COLUMN staple BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pantry_items.staple IS
  'Always on hand (salt, water, oil). Counts as available in any amount and is never deducted.';

CREATE TABLE pantry_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- The balance row this moved. Kept nullable: history outlives the balance.
  pantry_item_id UUID REFERENCES pantry_items(id) ON DELETE SET NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  -- Signed, in `unit`. Positive adds stock, negative consumes it.
  amount NUMERIC(12, 3),
  unit TEXT,
  kind TEXT NOT NULL CHECK (
    kind IN ('bought', 'cooked', 'wasted', 'adjusted', 'produced')
  ),
  -- What caused this, for idempotency and reversal. source_type is one of
  -- 'shopping_list_purchase', 'plan_entry', 'scan', 'manual', 'opening_balance'.
  source_type TEXT,
  source_id UUID,
  -- One cause can move several balance rows (a recipe draws flour from two
  -- jars). seq 0 is the claim marker that makes the whole set idempotent;
  -- the individual movements follow.
  source_seq INTEGER NOT NULL DEFAULT 0,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  unit_price NUMERIC(12, 4),
  expires_at DATE,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One transaction per cause. This single constraint is what stops a shopping
-- list item that is checked, unchecked and checked again from being counted
-- into the pantry twice.
CREATE UNIQUE INDEX idx_pantry_transactions_source
  ON pantry_transactions (source_type, source_id, source_seq)
  WHERE source_id IS NOT NULL;

CREATE INDEX idx_pantry_transactions_household
  ON pantry_transactions (household_id, created_at DESC);
CREATE INDEX idx_pantry_transactions_ingredient
  ON pantry_transactions (household_id, ingredient_id);

-- Existing stock has no recorded history; give it an opening balance so the
-- ledger reconciles against pantry_items from day one.
INSERT INTO pantry_transactions (
  household_id, pantry_item_id, ingredient_id, name, amount, unit,
  kind, source_type, source_id, expires_at, note, created_at
)
SELECT
  pi.household_id, pi.id, pi.ingredient_id, pi.name, pi.amount, pi.unit,
  'adjusted', 'opening_balance', pi.id, pi.expires_at,
  'Balance carried over when the ledger was introduced', pi.created_at
FROM pantry_items pi;
