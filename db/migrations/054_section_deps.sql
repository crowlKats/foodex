-- Section-level ordering: each row means section_id cannot start until depends_on is finished.
-- When a recipe has sections, step deps stay intra-section; cross-section ordering lives here.
CREATE TABLE recipe_section_deps (
  section_id UUID NOT NULL REFERENCES recipe_step_sections(id) ON DELETE CASCADE,
  depends_on UUID NOT NULL REFERENCES recipe_step_sections(id) ON DELETE CASCADE,
  PRIMARY KEY (section_id, depends_on),
  CHECK (section_id <> depends_on)
);

CREATE INDEX idx_section_deps_section ON recipe_section_deps(section_id);
CREATE INDEX idx_section_deps_dep ON recipe_section_deps(depends_on);
