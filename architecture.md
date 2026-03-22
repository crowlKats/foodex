# Foodex Architecture

## Stack

- **Framework:** Fresh 2 (Deno + Preact, islands architecture)
- **Database:** PostgreSQL via `pg` client
- **Styling:** Tailwind CSS v4 (no rounded corners, `border-2`, sharp cards)
- **Bundler:** Vite
- **Icons:** Tabler icons (`tb-icons`)
- **AI:** Anthropic Claude SDK (OCR, generation, refinement)
- **Storage:** AWS S3 with presigned URLs
- **Auth:** GitHub & Google OAuth

## Directory Structure

```
├── assets/styles.css          # Tailwind input + custom classes (.card, .btn, .recipe-body, .recipe-timer-btn, .cooking-mode-*)
├── client.ts                  # Client-side CSS import
├── main.ts                    # Entry point: static files, session auth middleware, household enforcement, request logging
├── utils.ts                   # State/User interfaces, define helper, escapeLike
├── vite.config.ts             # Vite + Fresh + Tailwind plugins
├── deno.json                  # Tasks, imports, compiler options
│
├── db/
│   ├── mod.ts                 # Connection pool, query/transaction helpers, orphaned media cleanup
│   ├── types.ts               # TypeScript interfaces for all DB row types
│   ├── migrate.ts             # Migration runner
│   └── migrations/            # Sequential .sql files (001–035)
│
├── lib/                       # Shared utilities
│   ├── auth.ts                # OAuth flows (GitHub/Google), session cookies
│   ├── bulk-insert.ts         # Batch DB insert helper
│   ├── currencies.ts          # Currency symbols and formatting
│   ├── duration.ts            # formatDuration(minutes) → "X hr Y min"
│   ├── format.ts              # CENTRALIZED number formatting: formatAmount, formatCurrency, formatInputValue
│   ├── form.ts                # Form parsing utilities
│   ├── generate-recipe.ts     # AI recipe generation orchestration
│   ├── markdown.ts            # Server-side step rendering (marked + template eval + @step/@recipe/@timer)
│   ├── ocr.ts                 # OCR extraction via Claude (OcrRecipeData interface)
│   ├── quantity.ts            # RecipeQuantity types, computeScaleRatio, formatQuantity
│   ├── recipe-prompt.ts       # JSON schema + rules for AI recipe output
│   ├── recipe-save.ts         # saveRecipeChildren() — bulk save ingredients/tools/steps/refs/tags
│   ├── s3.ts                  # S3 upload/download/presigned URL helpers
│   ├── template.ts            # Template expression parser: {{ key }}, {{ key.amount }}, arithmetic, functions
│   ├── timer.ts               # @timer() parsing, replaceTimers(), formatTimer, formatDurationLabel
│   ├── unit-convert.ts        # convertAmount() between units, density-based mass↔volume
│   ├── unit-display.ts        # Display units based on user preference
│   └── units.ts               # Unit definitions, UNIT_GROUPS, ALL_UNITS
│
├── components/                # Static Preact components (server-rendered)
│   ├── BackLink.tsx
│   ├── DurationInput.tsx
│   ├── FormField.tsx
│   ├── Nav.tsx
│   ├── PageHeader.tsx
│   ├── Pagination.tsx
│   ├── RefForm.tsx
│   ├── SearchBar.tsx
│   └── UnitSelect.tsx
│
├── islands/                   # Interactive Preact islands (client-hydrated)
│   ├── ConfirmButton.tsx
│   ├── CopyButton.tsx
│   ├── DarkModeToggle.tsx
│   ├── DraftEditor.tsx        # Draft editing with AI refinement
│   ├── FavoriteButton.tsx
│   ├── GenerateRecipe.tsx     # AI recipe generation UI
│   ├── ImageCrop.tsx
│   ├── ImageLightbox.tsx
│   ├── IngredientForm.tsx     # Dynamic ingredient list editor
│   ├── IngredientUnitFields.tsx
│   ├── MediaUpload.tsx
│   ├── MultiSearchSelect.tsx
│   ├── OcrUpload.tsx
│   ├── PantryManager.tsx      # Pantry CRUD with expiration warnings
│   ├── QuantityInput.tsx      # Servings/weight/volume/dimensions input
│   ├── RecipePreview.tsx      # Live markdown preview
│   ├── RecipeView.tsx         # Recipe display: scaling, timers, pantry check, cost, shopping list
│   ├── RefineInput.tsx
│   ├── SearchSelect.tsx
│   ├── SharedShoppingList.tsx
│   ├── ShoppingListView.tsx
│   ├── StepForm.tsx
│   ├── ThinkingToggle.tsx
│   └── ToolForm.tsx
│
├── routes/
│   ├── _app.tsx               # Root layout (Nav, dark mode, page title)
│   ├── index.tsx              # Redirects to /recipes
│   │
│   ├── auth/
│   │   ├── login.tsx
│   │   ├── logout.tsx
│   │   └── callback/{github,google}.tsx
│   │
│   ├── recipes/
│   │   ├── index.tsx          # List with search, favorites, cookable filter, pagination
│   │   ├── new.tsx            # Create form + POST handler
│   │   ├── import/index.tsx   # Import from images (OCR)
│   │   ├── [slug]/
│   │   │   ├── index.tsx      # View (SSR + RecipeView island) + DELETE handler
│   │   │   ├── edit.tsx       # Edit form + POST handler
│   │   │   └── clone.tsx      # POST-only clone handler
│   │   └── drafts/[id].tsx    # Draft edit + publish
│   │
│   ├── ingredients/
│   │   ├── index.tsx          # List with pagination
│   │   └── [id].tsx           # View/edit with prices
│   │
│   ├── shopping-list/
│   │   ├── index.tsx          # User's shopping list
│   │   └── shared/[token].tsx # Public shared view
│   │
│   ├── household/
│   │   ├── index.tsx          # Dashboard
│   │   └── pantry.tsx         # Pantry page
│   │
│   ├── households/
│   │   ├── index.tsx          # Create/join
│   │   └── join/[code].tsx    # Join via invite
│   │
│   ├── tools/{index,[id]}.tsx
│   ├── stores/{index,[id]}.tsx
│   ├── profile/index.tsx
│   ├── docs/
│   │   ├── templates.tsx      # HTML reference page
│   │   └── templates.md.tsx   # Plain text reference (also used in AI prompts)
│   │
│   └── api/
│       ├── recipes/favorite.tsx
│       ├── recipes/[slug]/render.tsx
│       ├── drafts.tsx
│       ├── drafts/[id].tsx
│       ├── generate-recipe.tsx
│       ├── refine-recipe.tsx
│       ├── shopping-list.tsx
│       ├── shopping-list-shared.tsx
│       ├── pantry.tsx         # add, update, remove, deduct_recipe actions
│       ├── ocr.tsx
│       ├── upload.tsx
│       └── media/{[id],[key]}.tsx
│
└── static/
    ├── favicon.ico
    └── logo.svg
```

## Database Schema (key tables)

- **recipes** — title, slug, description, quantity_type/value/unit (+
  value2/value3/unit2 for dimensions), prep_time, cook_time, difficulty,
  cover_image_id, household_id, private
- **recipe_ingredients** — recipe_id, ingredient_id (nullable), name, amount,
  unit, key, sort_order
- **recipe_steps** — recipe_id, title, body (markdown + template syntax),
  sort_order
- **recipe_step_media** — step_id, media_id, sort_order
- **recipe_tools** — recipe_id, tool_id, usage_description, settings, sort_order
- **recipe_references** — recipe_id, referenced_recipe_id, sort_order
- **recipe_tags** — recipe_id, tag_type (meal_type|dietary), tag_value
- **recipe_favorites** — user_id, recipe_id
- **recipe_drafts** — id (uuid), household_id, recipe_data (JSONB), ai_messages,
  source (manual|ocr|generate)
- **ingredients** — name, unit, density
- **ingredient_brands** — ingredient_id, brand
- **ingredient_prices** — ingredient_id, brand_id, store_id, price, amount, unit
- **stores** — name, currency
- **store_locations** — store_id, address
- **tools** — name, description
- **households** — name, created_by
- **household_members** — household_id, user_id, role (owner|member)
- **household_invites** — household_id, code, expires_at
- **pantry_items** — household_id, ingredient_id (nullable), name, amount, unit,
  expires_at
- **shopping_lists** — household_id, name
- **shopping_list_items** — shopping_list_id, ingredient_id, name, amount, unit,
  store_id, checked, recipe_id, sort_order
- **media** — key, url, content_type, filename, size_bytes
- **users** — name, email, avatar_url, github_id, google_id, unit_system
- **sessions** — user_id, token, expires_at

## Template Syntax (in recipe step bodies)

- `{{ key }}` — scaled amount + unit + name (lowercase)
- `{{ Key }}` — capitalized variant
- `{{ key.name }}` — name only
- `{{ key.amount }}` — numeric amount only
- `{{ expr }}` — arithmetic: `+`, `-`, `*`, `/`, `()`, functions: `round`,
  `ceil`, `floor`, `min`, `max`, `abs`
- `@step(N)` — link to step N
- `@recipe(slug)` — link to another recipe
- `@timer(duration)` — interactive countdown button (e.g. `@timer(15m)`,
  `@timer(1h30m)`)
- Standard Markdown for formatting

Processing order: template eval → @step/@recipe resolution → marked parse →
@timer replacement (after marked, since marked strips raw HTML)

## Recipe Field Touch Points

Adding a new recipe-level field requires changes in:

1. **Migration** — `db/migrations/NNN_*.sql`
2. **Type** — `db/types.ts` Recipe interface
3. **Create** — `routes/recipes/new.tsx` (form + INSERT)
4. **Edit** — `routes/recipes/[slug]/edit.tsx` (form + UPDATE)
5. **View** — `routes/recipes/[slug]/index.tsx` (display)
6. **List** — `routes/recipes/index.tsx` (display in cards)
7. **Clone** — `routes/recipes/[slug]/clone.tsx` (copy in INSERT)
8. **Draft editor** — `islands/DraftEditor.tsx` (form + formDataToRecipeData)
9. **Draft publish** — `routes/recipes/drafts/[id].tsx` (extract + INSERT)
10. **OCR interface** — `lib/ocr.ts` (OcrRecipeData interface)
11. **AI prompt** — `lib/recipe-prompt.ts` (JSON schema + field rules)

## Key Conventions

- **Number formatting:** Always use `lib/format.ts` — `formatAmount()`,
  `formatCurrency()`, `formatInputValue()`. Never use raw numbers or inline
  `.toFixed()`. Wrap with `Number()` for SSR safety (Preact passes signal
  objects during SSR).
- **Migrations:** Never modify existing migration files. Always create new ones.
- **UI style:** No rounded corners, `border-2` borders, sharp-cornered `.card`
  class. Orange accent color.
- **Pantry API actions:** `add`, `update`, `remove`, `deduct_recipe` (POST to
  `/api/pantry`)
