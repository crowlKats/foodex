// The extraction-output recipe shape (historically produced by the OCR/url/text
// importers, now by the assistant's structured-import tool) and the token-usage
// record shape. Kept as its own module so consumers don't depend on any
// particular extractor.

export interface CoverImageBounds {
  image_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrRecipeData {
  title: string;
  description: string;
  prep_time: number | null;
  cook_time: number | null;
  rest_time: number | null;
  difficulty: string | null;
  quantity_type: string;
  quantity_value: number;
  quantity_unit: string;
  ingredients: { key: string; name: string; amount: string; unit: string }[];
  /** Optional grouping of steps. Step.section refers to a section by key.
   * Sections form their own DAG: `after` is a list of section keys that must complete first. */
  sections?: { key: string; title: string; after?: string[] }[];
  steps: { title: string; body: string; section?: string | null }[];
  cover_image: CoverImageBounds | null;
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  meal_types?: string[];
  dietary_tags?: string[];
  output_ingredient_id?: string | null;
  output_amount?: number | null;
  output_unit?: string | null;
  output_expires_days?: number | null;
}

export interface OcrUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
}
