-- The moving box: recipes a member packs before leaving their household,
-- snapshotted as data (the agent's recipe representation) so they survive
-- losing access to the source household entirely. Media is copied to
-- box-scoped S3 objects at pack time for the same reason. The box unpacks
-- into whichever household the user lands in next.
CREATE TABLE moving_box_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_recipe_id UUID,
  title TEXT NOT NULL,
  data JSONB NOT NULL,
  -- Copied S3 objects: [{ media_id, key, content_type, filename, size_bytes }]
  media JSONB NOT NULL DEFAULT '[]',
  collection_names TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moving_box_recipes_user ON moving_box_recipes(user_id);
CREATE UNIQUE INDEX idx_moving_box_recipes_source
  ON moving_box_recipes(user_id, source_recipe_id)
  WHERE source_recipe_id IS NOT NULL;
