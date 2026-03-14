DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_devices')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_machines')
  THEN
    ALTER TABLE recipe_devices RENAME TO recipe_machines;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_devices_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'recipe_machines_id_seq')
  THEN
    ALTER SEQUENCE recipe_devices_id_seq RENAME TO recipe_machines_id_seq;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_machines' AND column_name = 'device_id') THEN
    ALTER TABLE recipe_machines RENAME COLUMN device_id TO machine_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'devices')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'machines')
  THEN
    ALTER TABLE devices RENAME TO machines;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'devices_id_seq')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'machines_id_seq')
  THEN
    ALTER SEQUENCE devices_id_seq RENAME TO machines_id_seq;
  END IF;
END $$;
