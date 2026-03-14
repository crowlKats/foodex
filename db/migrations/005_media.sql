CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  filename TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'cover_image_id'
  ) THEN
    ALTER TABLE recipes ADD COLUMN cover_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create section media table if it doesn't exist under either name
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_step_media')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_section_media')
  THEN
    -- Determine which parent table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_sections') THEN
      CREATE TABLE recipe_section_media (
        id SERIAL PRIMARY KEY,
        section_id INTEGER NOT NULL REFERENCES recipe_sections(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_steps') THEN
      CREATE TABLE recipe_step_media (
        id SERIAL PRIMARY KEY,
        step_id INTEGER NOT NULL REFERENCES recipe_steps(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    END IF;
  END IF;
END $$;
