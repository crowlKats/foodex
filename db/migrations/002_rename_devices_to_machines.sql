ALTER TABLE recipe_devices RENAME TO recipe_machines;
ALTER TABLE recipe_devices_id_seq RENAME TO recipe_machines_id_seq;
ALTER TABLE recipe_machines RENAME COLUMN device_id TO machine_id;
ALTER TABLE devices RENAME TO machines;
ALTER TABLE devices_id_seq RENAME TO machines_id_seq;
