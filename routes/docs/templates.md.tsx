import { define } from "../../utils.ts";

export const DOCS = `# Foodex Template Syntax Reference

## Overview
Recipe steps support a template syntax using \`{{ expression }}\` for dynamic ingredient amounts that scale automatically with recipe quantity changes. Steps also support standard Markdown formatting.

## Ingredient References
Each ingredient defined in a recipe has a **key** (e.g. \`flour\`, \`eggs\`, \`butter\`). Use the key inside \`{{ }}\` to reference it in step bodies.

### Full output (lowercase): \`{{ key }}\`
Renders the scaled amount + unit + name in lowercase.
Example: \`{{ flour }}\` → "200g flour"
Use in mid-sentence: "Mix {{ flour }} with {{ eggs }}."

### Capitalized: \`{{ Key }}\`
Same as above but with capitalized name (for start of sentence).
Example: \`{{ Flour }}\` → "200g Flour"

### Name only: \`{{ key.name }}\`
Renders just the ingredient name with no amount. Use when the amount is already shown in the sidebar or when referring to the ingredient without repeating the quantity.
Example: \`{{ flour.name }}\` → "flour"
Use: "Sift the {{ flour.name }} into a bowl."

### Amount only: \`{{ key.amount }}\`
Renders just the scaled numeric value. Useful for math or custom formatting.
Example: \`{{ flour.amount }}\` → "200"

All values scale automatically when the recipe quantity (servings, weight, volume, or tray dimensions) is changed.

## Arithmetic
Math operators work inside \`{{ }}\` expressions:
- \`+\` addition
- \`-\` subtraction
- \`*\` multiplication
- \`/\` division
- \`( )\` parentheses for grouping

Examples:
- \`{{ flour.amount / 2 }}\` → half the flour amount
- \`{{ flour.amount * 1.5 }}\` → 1.5x the flour
- \`{{ flour.amount + 50 }}\` → add 50
- \`{{ (flour.amount + sugar.amount) / 2 }}\` → average of two ingredients

## Functions
- \`round(x)\` — round to nearest integer
- \`ceil(x)\` — round up
- \`floor(x)\` — round down
- \`min(a, b)\` — smaller of two values
- \`max(a, b)\` — larger of two values
- \`abs(x)\` — absolute value

Examples:
- \`{{ round(flour.amount / 3) }}\`
- \`{{ ceil(eggs.amount) }}\`
- \`{{ min(flour.amount, 500) }}\`

## Sub-recipe References
Link to other recipes using \`@recipe(slug)\` where slug is the URL-friendly recipe name.
Example: \`@recipe(pizza-dough)\` renders as a clickable link to that recipe.

## Markdown
Step bodies support standard Markdown:
- \`**bold**\` for bold text
- \`*italic*\` for italic text
- \`- item\` for bullet lists
- \`1. item\` for numbered lists
- \`> quote\` for blockquotes

## Quantity Types
Recipes support four quantity types. Ingredient amounts scale proportionally:
- **Servings** — scale by ratio of target/base servings
- **Weight** (g/kg) — scale by weight ratio (unit-aware: 1kg = 1000g)
- **Volume** (ml/l) — scale by volume ratio (unit-aware: 1l = 1000ml)
- **Tray dimensions** (W x L x D cm) — scale by volume ratio (width × length × depth)

## Unit Formatting
Amounts are formatted based on unit type:
- Whole number units (g, mg, ml, cl, dl, mm, pcs, slice, clove, bunch, sprig, pinch, dash): rounded to integers
- Decimal units (kg, l, tsp, tbsp, cup, oz, lb, fl oz, cm, inch): up to 2 decimal places
`;

export const handler = define.handlers({
  GET() {
    return new Response(DOCS, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
});
