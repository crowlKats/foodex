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
- **Dynamic scaling**: adjust servings (or weight/volume/tray dimensions) and
  all ingredient amounts update in real time. Steps use a template syntax
  (`{{ flour }}`, `{{ sugar.amount * 2 }}`) that re-evaluates on the fly.
- **Sub-recipes**: reference other recipes with `@recipe(slug)` and cross-link
  steps with `@step(N)`.
- **Tags**: categorize by meal type (breakfast, lunch, dinner, snack, dessert,
  appetizer, side, drink) and dietary labels (vegetarian, vegan, gluten-free,
  dairy-free, nut-free, low-carb, keto, paleo).
- **Privacy**: mark recipes as private so only your household members can see
  them.
- **Cost estimates**: ingredient costs calculated from store prices, shown
  per-ingredient and as a recipe total.
- **Full-text search** across titles, ingredients, and step content.
- **Favorites**: bookmark recipes for quick access and filter your list to
  favorites only.
- **Cookable filter**: show only recipes you can make right now based on what's
  in your pantry.

### Import

- **Import from image**: upload photos of cookbook pages, handwritten notes, or
  screenshots. AI (Claude) extracts the title, ingredients, steps, times, and
  even crops a cover photo. Supports any language with automatic English
  translation.

### Pantry

- Track what ingredients your household has on hand, with optional amounts and
  units.
- **Pantry indicators on recipes**: when viewing a recipe, ingredients you
  already have are highlighted, and the "Add to shopping list" button
  automatically subtracts pantry stock.
- **Auto-restock**: when you check off a shopping list item (bought), it's
  automatically added to your pantry.

### Shopping List

- One shared shopping list per household.
- Add items from recipes (all at once or individually) or manually.
- **Two view modes**: group by recipe or group by store.
- Assign items to stores and see per-store and overall cost totals.
- Check off items as you shop; checked items can be cleared in bulk.
- Merged view: when the same ingredient appears from multiple recipes, amounts
  are combined in the store view.

### Ingredients

- Global ingredient catalog with units and full-text search.
- **Pricing**: record prices per store with amounts (e.g. "$2.50 per 500g").
  Cheapest price shown on the list.
- **Brands**: track multiple brands per ingredient.
- **Merge**: combine duplicate ingredients, automatically reparenting all
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
- **Roles**: owner and member. Owners can manage members, invites, and settings,
  and can promote members to owner; an owner can leave once someone else owns
  the household.
- **Moving box**: before leaving, pack recipes (and whole collections) to take
  with you. Packed copies keep their images and unpack automatically into the
  next household you create or join.
- Shared pantry, shared shopping list, and shared recipe ownership.
- Manage which tools and stores your household uses.

### Other

- **Dark mode** with system preference detection and manual toggle.
- **OAuth sign-in** via GitHub or Google.
- **Mobile-friendly** responsive layout.
- **In-app documentation** (`/docs`): a multi-page user guide covering every
  feature, plus a full template syntax reference (`/docs/templates`) for recipe
  authors.

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
OPENROUTER_API_KEY=...      # all model calls go through OpenRouter (openrouter/auto-beta)
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=...             # optional, for S3-compatible services
ADMIN_EMAILS=...            # optional, comma-separated; grants /admin access
INVITE_ONLY=true            # optional; disables self-serve household creation
```

### Admin panel

Set `ADMIN_EMAILS` to a comma-separated list of account emails (matched
case-insensitively against the signed-in user, whichever provider they used,
including Authentik) to unlock `/admin`: platform stats, user and household
management, recipe moderation, the audit log, and system maintenance (session
purge, orphaned media cleanup). Accounts not on the list get a 404 for any
`/admin` URL.

Edit operations across the platform (recipes, ingredients, stores, tools,
dishes, collections, households) are recorded in an audit log, tagged with the
surface that made them: the app, the assistant, or the admin panel. Admins can
browse it at `/admin/audit`.

Admins can also **sudo** as a user from that user's admin page: the whole app
then behaves as if that user were signed in (their household, their private
data) until sudo is exited via the banner shown on every page. Audit entries
made under sudo are attributed to the admin, labeled with who they were acting
as.

### Invite-only mode

Set `INVITE_ONLY=true` to stop accounts from creating households themselves.
Admins invite new users by email from `/admin/households`: this seeds an empty
household and sends an invite link; the invitee signs in, becomes its owner, and
names it. Household members can still invite others into their household with
regular invites, so the platform is limited to people someone chose to let in.
Signing in stays open, but without a household an account can't reach anything
household-scoped.

### Retention

Two cleanups run automatically on regular traffic, alongside the existing
session pruning:

- Accounts that spend a week without a household are deleted: abandoned
  onboarding, an unaccepted invite, or leaving a household without landing in a
  new one. The clock starts when the account becomes household-less, not when it
  was created. A packed moving box extends the grace period to 30 days. Admin
  accounts are exempt.
- Media that has been unreferenced by any recipe, step, or draft for over a week
  is purged, including the S3 objects. The grace period protects uploads
  belonging to edits still in progress.

Automated deletions appear in the audit log under the `system` actor.

### Setup

```sh
# Install dependencies
deno install

# Run database migrations
deno task migrate

# Start dev server
deno task dev
```
