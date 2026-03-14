ALTER TABLE IF EXISTS recipe_devices RENAME TO recipe_machines;
ALTER SEQUENCE IF EXISTS recipe_devices_id_seq RENAME TO recipe_machines_id_seq;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_machines' AND column_name = 'device_id') THEN
    ALTER TABLE recipe_machines RENAME COLUMN device_id TO machine_id;
  END IF;
END $$;
ALTER TABLE IF EXISTS devices RENAME TO machines;
ALTER SEQUENCE IF EXISTS devices_id_seq RENAME TO machines_id_seq;
