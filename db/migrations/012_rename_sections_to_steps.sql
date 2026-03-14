ALTER TABLE recipe_sections RENAME TO recipe_steps;
ALTER TABLE recipe_sections_id_seq RENAME TO recipe_steps_id_seq;
ALTER TABLE recipe_section_media RENAME COLUMN section_id TO step_id;
ALTER TABLE recipe_section_media RENAME TO recipe_step_media;
ALTER TABLE recipe_section_media_id_seq RENAME TO recipe_step_media_id_seq;
