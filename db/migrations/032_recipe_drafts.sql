CREATE TABLE recipe_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipe_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_thinking TEXT,
  cover_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ocr', 'generate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_drafts_household_id ON recipe_drafts(household_id);
