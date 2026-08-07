-- The missing middle: what the household intends to cook.
--
-- Both the pantry and the shopping list are downstream of this question, and
-- neither could answer it before. A plan entry is the durable form of "add this
-- recipe to the shopping list": it remembers the scale, so changing the
-- servings updates what you need to buy instead of leaving a stale snapshot,
-- and cooking it is the entry's terminal state rather than a floating button.

CREATE TABLE plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  -- Scale relative to the recipe's own quantity: 2 = double batch.
  scale NUMERIC(10, 4) NOT NULL DEFAULT 1 CHECK (scale > 0),
  planned_for DATE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'cooked', 'skipped')),
  -- Planned meals drive the shopping list; turn this off to plan without buying.
  include_in_list BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cooked_at TIMESTAMPTZ
);

CREATE INDEX idx_plan_entries_household
  ON plan_entries (household_id, status, planned_for NULLS LAST);
CREATE INDEX idx_plan_entries_recipe ON plan_entries (recipe_id);

-- Only outstanding entries generate demand; cooking one both deducts stock and
-- removes its claim on the shopping list.
CREATE INDEX idx_plan_entries_open
  ON plan_entries (household_id)
  WHERE status = 'planned';
