# Foodex

A recipe management and household cooking app built with
[Fresh](https://fresh.deno.dev/) (Deno), PostgreSQL, and Preact.

Foodex helps you manage recipes with dynamic ingredient scaling, track your
pantry, build shopping lists with price estimates, and collaborate with your
household.

## Features

### Recipes

- **Create, edit, clone, and delete** recipes with cover images, descriptions,
  prep/cook times, and step-by-step instructions with embedded photos.
- **Dynamic scaling** — adjust servings (or weight/volume/tray dimensions) and
  all ingredient amounts update in real time. Steps use a template syntax
  (`{{ flour }}`, `{{ sugar.amount * 2 }}`) that re-evaluates on the fly.
- **Sub-recipes** — reference other recipes with `@recipe(slug)` and cross-link
  steps with `@step(N)`.
- **Tags** — categorize by meal type (breakfast, lunch, dinner, snack, dessert,
  appetizer, side, drink) and dietary labels (vegetarian, vegan, gluten-free,
  dairy-free, nut-free, low-carb, keto, paleo).
- **Privacy** — mark recipes as private so only your household members can see
  them.
- **Cost estimates** — ingredient costs calculated from store prices, shown
  per-ingredient and as a recipe total.
- **Full-text search** across titles, ingredients, and step content.
- **Favorites** — bookmark recipes for quick access and filter your list to
  favorites only.
- **Cookable filter** — show only recipes you can make right now based on what's
  in your pantry.

### Import & AI Generation

- **Import from image** — upload photos of cookbook pages, handwritten notes, or
  screenshots. AI (Claude) extracts the title, ingredients, steps, times, and
  even crops a cover photo. Supports any language with automatic English
  translation.
- **Generate from pantry** — AI suggests a recipe based on what you have on
  hand. Set a maximum total time and provide custom instructions (e.g.
  "something Italian", "a dessert", "no spicy food"). The generated recipe lands
  in the same review form as imports so you can edit before saving.

### Pantry

- Track what ingredients your household has on hand, with optional amounts and
  units.
- **Pantry indicators on recipes** — when viewing a recipe, ingredients you
  already have are highlighted, and the "Add to shopping list" button
  automatically subtracts pantry stock.
- **Auto-restock** — when you check off a shopping list item (bought), it's
  automatically added to your pantry.

### Shopping List

- One shared shopping list per household.
- Add items from recipes (all at once or individually) or manually.
- **Two view modes**: group by recipe or group by store.
- Assign items to stores and see per-store and overall cost totals.
- Check off items as you shop — checked items can be cleared in bulk.
- Merged view: when the same ingredient appears from multiple recipes, amounts
  are combined in the store view.

### Ingredients

- Global ingredient catalog with units and full-text search.
- **Pricing** — record prices per store with amounts (e.g. "$2.50 per 500g").
  Cheapest price shown on the list.
- **Brands** — track multiple brands per ingredient.
- **Merge** — combine duplicate ingredients, automatically reparenting all
  recipe, pantry, and shopping list references.

### Stores

- Global store catalog with currency support (20+ currencies).
- **Multiple locations** per store (addresses for chain stores).
- View all ingredient prices at a store.
- Mark stores as "ours" to associate them with your household.

### Tools & Equipment

- Global catalog of kitchen tools with descriptions.
- Attach tools to recipes with usage notes and settings (e.g. "Oven — 180C
  convection").
- See which recipes use a given tool.
- Mark tools as owned by your household.

### Households & Collaboration

- Create a household and invite others via shareable links (7-day expiry).
- **Roles**: owner and member. Owners can manage members, invites, and settings.
- Shared pantry, shared shopping list, and shared recipe ownership.
- Manage which tools and stores your household uses.

### Other

- **Dark mode** with system preference detection and manual toggle.
- **OAuth sign-in** via GitHub or Google.
- **Mobile-friendly** responsive layout.
- **Template docs** page (`/docs/templates`) with full syntax reference for
  recipe authors.

## Tech Stack

- **Runtime**: [Deno](https://deno.com/)
- **Framework**: [Fresh 2](https://fresh.deno.dev/) with
  [Preact](https://preactjs.com/) and
  [@preact/signals](https://preactjs.com/guide/v10/signals/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database**: PostgreSQL via [node-postgres](https://node-postgres.com/)
- **AI**: [Anthropic Claude API](https://docs.anthropic.com/) for OCR and recipe
  generation
- **Storage**: AWS S3 for media uploads
- **Build**: Vite

## Getting Started

### Prerequisites

- [Deno](https://deno.com/) v2+
- PostgreSQL
- An S3-compatible bucket for media uploads

### Environment Variables

```sh
DATABASE_URL=postgresql://user:pass@localhost:5432/foodex
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...       # for OCR import and recipe generation
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=...             # optional, for S3-compatible services
```

### Setup

```sh
# Install dependencies
deno install

# Run database migrations
deno task migrate

# Start dev server
deno task dev
```

### Available Tasks

| Task      | Command             | Description                  |
| --------- | ------------------- | ---------------------------- |
| `dev`     | `deno task dev`     | Start Vite dev server        |
| `build`   | `deno task build`   | Production build             |
| `start`   | `deno task start`   | Serve production build       |
| `migrate` | `deno task migrate` | Run database migrations      |
| `check`   | `deno task check`   | Format, lint, and type-check |
