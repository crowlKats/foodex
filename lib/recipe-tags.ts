export const MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "appetizer",
  "side",
  "drink",
] as const;

export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "low-carb",
  "keto",
  "paleo",
] as const;

export const DIFFICULTY_LEVELS = [
  "easy",
  "medium",
  "hard",
] as const;

export const SOURCE_TYPES = [
  "book",
  "website",
  "family",
  "ai_generated",
  "personal",
  "other",
] as const;

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  book: "Book",
  website: "Website",
  family: "Family / Friend",
  ai_generated: "AI Generated",
  personal: "Personal",
  other: "Other",
};
