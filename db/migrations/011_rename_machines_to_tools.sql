ALTER TABLE recipe_machines RENAME TO recipe_tools;
ALTER TABLE recipe_machines_id_seq RENAME TO recipe_tools_id_seq;
ALTER TABLE recipe_tools RENAME COLUMN machine_id TO tool_id;
ALTER TABLE machines RENAME TO tools;
ALTER TABLE machines_id_seq RENAME TO tools_id_seq;
