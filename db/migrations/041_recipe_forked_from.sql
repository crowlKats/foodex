ALTER TABLE recipes ADD COLUMN forked_from_id integer REFERENCES recipes(id) ON DELETE SET NULL;
CREATE INDEX idx_recipes_forked_from ON recipes(forked_from_id) WHERE forked_from_id IS NOT NULL;
