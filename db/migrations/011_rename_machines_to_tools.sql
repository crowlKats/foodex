DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_machines')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_tools')
  THEN
    ALTER TABLE recipe_machines RENAME TO recipe_tools;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_machines_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_tools_id_seq')
  THEN
    ALTER SEQUENCE recipe_machines_id_seq RENAME TO recipe_tools_id_seq;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_tools' AND column_name = 'machine_id'
  ) THEN
    ALTER TABLE recipe_tools RENAME COLUMN machine_id TO tool_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'machines')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tools')
  THEN
    ALTER TABLE machines RENAME TO tools;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'machines_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'tools_id_seq')
  THEN
    ALTER SEQUENCE machines_id_seq RENAME TO tools_id_seq;
  END IF;
END $$;
