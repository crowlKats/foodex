ALTER TABLE recipe_drafts DROP CONSTRAINT IF EXISTS recipe_drafts_source_check;
ALTER TABLE recipe_drafts ADD CONSTRAINT recipe_drafts_source_check
  CHECK (source IN ('manual', 'ocr', 'generate', 'url', 'text'));
