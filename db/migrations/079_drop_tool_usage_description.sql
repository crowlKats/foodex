-- Tools are referenced inline from step bodies via @tool(name, settings), so
-- the surrounding sentence already says what the tool is for; a separate
-- freeform usage note duplicated that, worse, and was another field to fill.
ALTER TABLE recipe_tools DROP COLUMN usage_description;
