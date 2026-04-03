-- Step dependency graph: each row means step_id cannot start until depends_on is finished.
CREATE TABLE recipe_step_deps (
  step_id    UUID NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
  depends_on UUID NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
  PRIMARY KEY (step_id, depends_on),
  CHECK (step_id <> depends_on)
);

CREATE INDEX idx_step_deps_step ON recipe_step_deps(step_id);
CREATE INDEX idx_step_deps_dep ON recipe_step_deps(depends_on);
