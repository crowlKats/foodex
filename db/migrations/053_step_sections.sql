-- Recipe step sections: optional grouping of steps with their own per-section numbering.
-- A section's `key` is used in @step(key.N) template references.
CREATE TABLE recipe_step_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (recipe_id, key)
);

CREATE INDEX idx_step_sections_recipe ON recipe_step_sections(recipe_id);

ALTER TABLE recipe_steps
  ADD COLUMN section_id UUID REFERENCES recipe_step_sections(id) ON DELETE SET NULL;

CREATE INDEX idx_steps_section ON recipe_steps(section_id);
