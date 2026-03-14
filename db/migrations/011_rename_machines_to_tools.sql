ALTER TABLE IF EXISTS recipe_machines RENAME TO recipe_tools;
ALTER SEQUENCE IF EXISTS recipe_machines_id_seq RENAME TO recipe_tools_id_seq;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipe_tools' AND column_name = 'machine_id'
  ) THEN
    ALTER TABLE recipe_tools RENAME COLUMN machine_id TO tool_id;
  END IF;
END $$;

ALTER TABLE IF EXISTS machines RENAME TO tools;
ALTER SEQUENCE IF EXISTS machines_id_seq RENAME TO tools_id_seq;
