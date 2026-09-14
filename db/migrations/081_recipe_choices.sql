-- Choices: a recipe can offer alternatives ("Cooking method: stovetop or
-- oven"), and the cook picks one. Steps, sections and ingredient rows can be
-- tagged with the option they belong to; anything tagged with an option the
-- cook did not pick is hidden from the step list, cooking mode, the
-- ingredient list and shopping. Untagged rows always apply.

CREATE TABLE recipe_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  -- What the cook is choosing between, shown with the picker.
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (recipe_id, key)
);

CREATE TABLE recipe_choice_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  choice_id UUID NOT NULL REFERENCES recipe_choices(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- The first option listed. Server-side features that cannot ask the cook
  -- (plan-driven shopping, the cookable filter) assume this one.
  is_default BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (choice_id, key)
);

CREATE INDEX idx_recipe_choices_recipe ON recipe_choices (recipe_id);
CREATE INDEX idx_recipe_choice_options_choice ON recipe_choice_options (choice_id);

ALTER TABLE recipe_steps
  ADD COLUMN option_id UUID REFERENCES recipe_choice_options(id) ON DELETE SET NULL;
ALTER TABLE recipe_step_sections
  ADD COLUMN option_id UUID REFERENCES recipe_choice_options(id) ON DELETE SET NULL;
ALTER TABLE recipe_ingredients
  ADD COLUMN option_id UUID REFERENCES recipe_choice_options(id) ON DELETE SET NULL;

-- True for rows that apply under the default selection: untagged rows and
-- rows tagged with a choice's default option.
CREATE OR REPLACE FUNCTION fx_option_default(p_option_id UUID) RETURNS BOOLEAN AS $$
  SELECT p_option_id IS NULL OR EXISTS (
    SELECT 1 FROM recipe_choice_options o WHERE o.id = p_option_id AND o.is_default
  );
$$ LANGUAGE sql STABLE;

-- A planned meal remembers which options the cook picked, so the shopping
-- list and the pantry deduction follow the same choice the page showed.
-- NULL means "the defaults".
ALTER TABLE plan_entries ADD COLUMN option_ids UUID[];

-- True for rows that apply under a plan entry's picks: untagged rows, rows
-- tagged with a picked option, or (with no picks recorded) default options.
CREATE OR REPLACE FUNCTION fx_option_active(p_option_id UUID, p_picked UUID[])
RETURNS BOOLEAN AS $$
  SELECT p_option_id IS NULL OR CASE
    WHEN p_picked IS NULL THEN fx_option_default(p_option_id)
    ELSE p_option_id = ANY(p_picked)
  END;
$$ LANGUAGE sql STABLE;
