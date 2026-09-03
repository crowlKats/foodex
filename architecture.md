# Foodex Architecture

## Stack

- **Framework:** Fresh 2 (Deno + Preact, islands architecture)
- **Database:** PostgreSQL via `pg` client
- **Styling:** Tailwind CSS v4 (no rounded corners, `border-2`, sharp cards)
- **Bundler:** Vite
- **Icons:** Tabler icons (`tb-icons`)
- **AI:** Anthropic Claude SDK (assistant sessions with staging; imports
  (URL/text/photos) run through the assistant)
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
│   └── migrations/            # Sequential .sql files (001–080)
│
├── lib/                       # Shared utilities
│   ├── auth.ts                # OAuth flows (GitHub/Google), session cookies
│   ├── bulk-insert.ts         # Batch DB insert helper
│   ├── currencies.ts          # Currency symbols and formatting
│   ├── duration.ts            # formatDuration(minutes) → "X hr Y min"
│   ├── format.ts              # CENTRALIZED number formatting: formatAmount, formatCurrency, formatInputValue
│   ├── form.ts                # Form parsing utilities
│   ├── inventory.ts           # CANONICAL "do we have it?": matching, availability,
│   │                          #   consumption planning. Every surface uses this
│   ├── pantry.ts              # The only writer of stock: ledger + balance
│   ├── plan.ts                # Meal plan, cooking, suggestions
│   ├── shopping-list.ts       # Demand → line projection, buying
│   ├── markdown.ts            # Server-side step rendering (marked + template eval + @step/@recipe/@timer)
│   ├── recipe-data.ts         # OcrRecipeData extraction-output shape
│   ├── image-downscale.ts     # Client-side photo re-encode + upload (islands only)
│   ├── agent/                 # Assistant: event log, staging, tools, turn loop
│   ├── quantity.ts            # RecipeQuantity types, computeScaleRatio, formatQuantity
│   ├── recipe-prompt.ts       # JSON schema + rules for AI recipe output
│   ├── recipe-save.ts         # saveRecipeChildren(): bulk save ingredients/tools/steps/refs/tags
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
│   ├── AgentSession.tsx       # Assistant chat + staged-recipe workbench
│   ├── RecipeFields.tsx       # THE shared recipe edit form (new/edit/agent)
│   ├── ImportStart.tsx        # Chatless import entry (URL/text/photos → session)
│   ├── FavoriteButton.tsx
│   ├── GenerateRecipe.tsx     # Generate-from-pantry (seeds an agent session)
│   ├── ImageCrop.tsx
│   ├── ImageLightbox.tsx
│   ├── IngredientForm.tsx     # Dynamic ingredient list editor
│   ├── IngredientUnitFields.tsx
│   ├── MediaUpload.tsx
│   ├── MultiSearchSelect.tsx
│   ├── PantryManager.tsx      # Pantry CRUD with expiration warnings
│   ├── QuantityInput.tsx      # Servings/weight/volume/dimensions input
│   ├── RecipePreview.tsx      # Live markdown preview
│   ├── RecipeView.tsx         # Recipe display: scaling, timers, pantry check, cost, shopping list
│   ├── SearchSelect.tsx
│   ├── SharedShoppingList.tsx
│   ├── ShoppingListView.tsx
│   ├── StepForm.tsx
│   ├── ThinkingToggle.tsx
│   └── ToolForm.tsx
│
├── routes/
│   ├── plan/index.tsx         # Meal plan: planned meals, cooking, suggestions
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
│   │   ├── import/index.tsx   # Chatless import (URL/text/photos → agent session)
│   │   ├── import/bulk.tsx    # Bulk import: many photos → grouped → one session each
│   │   ├── [slug]/
│   │   │   ├── index.tsx      # View (SSR + RecipeView island) + DELETE handler
│   │   │   ├── edit.tsx       # Edit form + POST handler
│   │   │   └── clone.tsx      # POST-only clone handler
│   │   └── drafts/[id].tsx    # Legacy draft → agent session migration (303)
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
│       ├── agent/…            # Sessions, messages (SSE), staging, rollback
│       ├── shopping-list.tsx
│       ├── shopping-list-shared.tsx
│       ├── pantry.tsx         # add, update, remove, deduct_recipe actions
│       ├── upload.tsx
│       └── media/{[id],[key]}.tsx
│
└── static/
    ├── favicon.ico
    └── logo.svg
```

## Database Schema (key tables)

- **recipes**: title, slug, description, quantity_type/value/unit (+
  value2/value3/unit2 for dimensions), prep_time, cook_time, difficulty,
  cover_image_id, household_id, private,
  output_ingredient_id/output_amount/output_unit (optional: links recipe to the
  ingredient it produces with yield amount), dish_id/dish_manual (what dish the
  recipe makes; see **dishes**)
- **dishes**: name, slug. The identity shared by every recipe that makes the
  same dish, across households. Maintained automatically: a trigger
  (`update_recipe_dish`, migration 062) resolves the recipe title through
  `dish_aliases` on every insert/title change and creates the dish on first use,
  so no write path can forget it. `dish_manual = true` pins a recipe to a
  user-chosen dish through later title edits. Orthogonal to output_ingredient_id
  (identity vs. pantry yield)
- **dish_aliases**: dish_id, norm_name (unique). Every normalized name that
  resolves to a dish. Merging two dishes must repoint aliases rather than delete
  them; that is what makes the merge permanent for future recipes. The inverse,
  splitting a name back out of a merged dish, cannot happen through resolution
  (the alias always wins); `fx_dish_create` (migration 064, used by the edit
  form's dish picker) creates the name's own dish, repoints the alias to it, and
  moves matching auto-tracked recipes along
- **recipe_ingredients**: recipe_id, ingredient_id (required; every line links
  to a real ingredient, find-or-created by name on save; migration 067), name,
  amount, unit, key, sort_order
- **recipe_steps**: recipe_id, title, body (markdown + template syntax),
  sort_order
- **recipe_step_media**: step_id, media_id, sort_order
- **recipe_tools**: recipe_id, tool_id, settings, sort_order
- **recipe_references**: recipe_id, referenced_recipe_id, sort_order
- **recipe_tags**: recipe_id, tag_type (meal_type|dietary|cuisine), tag_value
- **recipe_favorites**: user_id, recipe_id
- **recipe_drafts**: id (uuid), household_id, recipe_data (JSONB), ai_messages,
  source (manual|ocr|generate)
- **ingredients**: name, unit, density
- **ingredient_brands**: ingredient_id, brand
- **ingredient_prices**: ingredient_id, brand_id, store_id, price, amount, unit
- **stores**: name, currency
- **store_locations**: store_id, address
- **tools**: name, description
- **households**: name, created_by
- **household_members**: household_id, user_id, role (owner|member)
- **household_invites**: household_id, code, expires_at
- **pantry_items**: household_id, ingredient_id (required since migration 068,
  like recipe lines), name, amount, unit, expires_at, staple. Current _balance_;
  derived from pantry_transactions and only ever written through `lib/pantry.ts`
- **pantry_transactions**: household_id, pantry_item_id, ingredient_id, name,
  signed amount, unit, kind (bought|cooked|wasted|adjusted|produced),
  source_type/source_id/source_seq (unique; the idempotency key), store_id,
  unit_price, expires_at. Why stock moved
- **plan_entries**: household_id, recipe_id (nullable), dish_id (nullable),
  target_servings, scale, planned_for, status (planned|cooked|skipped),
  include_in_list, cooked_at. What the household intends to cook; the source of
  recipe demand. An entry names a recipe OR a dish (CHECK-enforced): dish
  entries defer the recipe choice to cook time ("pin"), contribute no shopping
  demand until pinned (every demand reader inner-joins recipe_id), and derive
  their batch scale from target_servings when pinned
- **shopping_lists**: household_id (unique; one list per household), share_token
- **shopping_list_demands**: shopping_list_id, ingredient_id, name, amount,
  unit. Hand-added items only; recipe demand comes from plan_entries
- **shopping_list_purchases**: shopping_list_id, match_key, name, amount, unit,
  store_id, price. A ticked-off line; its existence _is_ "checked"
- **household_ingredient_stores**: household_id, ingredient_id, store_id. Where
  this household actually buys a thing
- **media**: key, url, content_type, filename, size_bytes
- **users**: name, email, avatar_url, github_id, google_id, unit_system
- **sessions**: user_id, token, expires_at

## Kitchen Data Flow

The pantry, the meal plan and the shopping list are one system with a single
direction of travel:

```
recipe ──plan──▶ plan_entries ──┐
                                ├──▶ shopping list  = demand − stock − bought
manual item ──▶ demands ────────┘          │
                                           │ tick off = buy
                                           ▼
                          pantry_transactions ──▶ pantry_items (balance)
                                           ▲
                                           │ cook a plan entry
                                           └── deducts ingredients,
                                               books the recipe's output
```

Consequences worth knowing before changing any of it:

- **The shopping list has no rows.** Lines are projected on every read, so they
  cannot go stale, and mutations return the recomputed projection rather than
  letting the client patch its own copy.
- **Stock only moves through the ledger.** Each cause writes one transaction set
  keyed by `(source_type, source_id, source_seq)`, which makes buying idempotent
  and cooking reversible. `reverseSource()` undoes any cause exactly.
- **Availability is one function.** `computeAvailability()` in
  `lib/inventory.ts` answers every "do we have it" question;
  `db/migrations/056_inventory_units.sql` mirrors its unit maths in SQL
  (`fx_convert`, `fx_match_key`) for the filters that must run in the database.
  Change one, change the other.

## Template Syntax (in recipe step bodies)

- `{{ key }}`: scaled amount + unit + name (lowercase)
- `{{ Key }}`: capitalized variant
- `{{ key.name }}`: name only
- `{{ key.amount }}`: numeric amount only
- `{{ expr }}`: arithmetic: `+`, `-`, `*`, `/`, `()`, functions: `round`,
  `ceil`, `floor`, `min`, `max`, `abs`
- `@step(N)`: link to step N
- `@recipe(slug)`: link to another recipe
- `@timer(duration)`: interactive countdown button (e.g. `@timer(15m)`,
  `@timer(1h30m)`)
- Standard Markdown for formatting

Processing order: template eval → @step/@recipe resolution → marked parse →
@timer replacement (after marked, since marked strips raw HTML)

## Recipe Field Touch Points

There is ONE recipe edit form, `islands/RecipeFields.tsx`, used by
`/recipes/new`, `/recipes/[slug]/edit`, and the agent session workbench. All
imports (URL / text / photos) run through the assistant (`/recipes/import` seeds
a session; `lib/agent/*` stages the recipe).

Adding a new recipe-level field requires changes in:

1. **Migration**: `db/migrations/NNN_*.sql`
2. **Type**: `db/types.ts` Recipe interface
3. **Form**: `islands/RecipeFields.tsx` (the one shared editor)
4. **Form round-trip**: `lib/recipe-form-data.ts` (FormData → recipe data)
5. **Create**: `routes/recipes/new.tsx` (POST scalar extraction)
6. **Edit**: `routes/recipes/[slug]/edit.tsx` (POST scalar extraction) +
   `lib/recipe-edit-data.ts` (load + `editDataToRecipeFields`)
7. **View**: `routes/recipes/[slug]/index.tsx` (display)
8. **List**: `routes/recipes/index.tsx` (display in cards)
9. **Clone**: `routes/recipes/[slug]/clone.tsx` (copy in INSERT)
10. **Agent shape**: `lib/agent/recipe.ts` (AgentRecipe + SCALAR_COLS +
    loaders/writers)
11. **AI prompt**: `lib/recipe-prompt.ts` (JSON schema + field rules)

## Key Conventions

- **Number formatting:** Always use `lib/format.ts`: `formatAmount()`,
  `formatCurrency()`, `formatInputValue()`. Never use raw numbers or inline
  `.toFixed()`. Wrap with `Number()` for SSR safety (Preact passes signal
  objects during SSR).
- **Migrations:** Never modify existing migration files. Always create new ones.
- **UI style:** No rounded corners, `border-2` borders, sharp-cornered `.card`
  class. Orange accent color.
- **Pantry API actions:** `add`, `update`, `remove`, `merge`, `set_staple` (POST
  to `/api/pantry`). Deducting is not a pantry action; it happens by cooking a
  plan entry (`/api/plan`)
- **Never write `pantry_items` directly.** Go through `lib/pantry.ts` so the
  transaction that explains the change is recorded alongside it
- **Never answer "do we have this?" inline.** `lib/inventory.ts` owns that
  question; six divergent implementations of it is what this replaced
