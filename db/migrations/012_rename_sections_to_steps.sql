DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_sections')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_steps')
  THEN
    ALTER TABLE recipe_sections RENAME TO recipe_steps;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_sections_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_steps_id_seq')
  THEN
    ALTER SEQUENCE recipe_sections_id_seq RENAME TO recipe_steps_id_seq;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_section_media' AND column_name = 'section_id'
  ) THEN
    ALTER TABLE recipe_section_media RENAME COLUMN section_id TO step_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_section_media')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_step_media')
  THEN
    ALTER TABLE recipe_section_media RENAME TO recipe_step_media;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_section_media_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_step_media_id_seq')
  THEN
    ALTER SEQUENCE recipe_section_media_id_seq RENAME TO recipe_step_media_id_seq;
  END IF;
END $$;
