import { define } from "../../utils.ts";
import { BackLink } from "../../components/BackLink.tsx";

export default define.page(function GuideDocs() {
  const sectionClass =
    "text-xl font-bold mb-3 pb-1 border-b-2 border-stone-300 dark:border-stone-700";
  const subSectionClass = "text-lg font-bold mb-2";
  const prose = "text-stone-700 dark:text-stone-300";
  const listItem = "text-stone-700 dark:text-stone-300";

  return (
    <div class="max-w-3xl">
      <BackLink href="/recipes" label="Back to Recipes" />

      <h1 class="text-3xl font-bold mt-4 mb-2">User Guide</h1>
      <p class="text-stone-500 dark:text-stone-400 mb-8">
        Everything you need to know about using Foodex, explained in plain
        language.
      </p>

      {/* Table of Contents */}
      <nav class="card mb-8">
        <h2 class="font-bold mb-3">On this page</h2>
        <ul class="space-y-1 text-sm">
          <li>
            <a href="#getting-started" class="link">
              Getting Started
            </a>
          </li>
          <li>
            <a href="#recipes" class="link">
              Recipes
            </a>
            <span class="text-stone-400">
              {" "}— browsing, creating, importing, AI generation
            </span>
          </li>
          <li>
            <a href="#pantry" class="link">
              Your Pantry
            </a>
            <span class="text-stone-400">
              {" "}— tracking ingredients, barcode scanning
            </span>
          </li>
          <li>
            <a href="#shopping-lists" class="link">
              Shopping Lists
            </a>
            <span class="text-stone-400">
              — building, sharing, checking off
            </span>
          </li>
          <li>
            <a href="#household" class="link">
              Household Management
            </a>
            <span class="text-stone-400">
              {" "}— members, tools, stores
            </span>
          </li>
          <li>
            <a href="#ingredients-and-prices" class="link">
              Ingredients &amp; Prices
            </a>
          </li>
          <li>
            <a href="#settings" class="link">
              Settings
            </a>
          </li>
          <li>
            <a href="#tips" class="link">
              Tips &amp; Tricks
            </a>
          </li>
        </ul>
      </nav>

      <div class="space-y-10">
        {/* ── Getting Started ── */}
        <section id="getting-started">
          <h2 class={sectionClass}>Getting Started</h2>

          <h3 class={subSectionClass}>Signing In</h3>
          <p class={`${prose} mb-4`}>
            To use Foodex, you sign in with either your <strong>GitHub</strong>
            {" "}
            or <strong>Google</strong>{" "}
            account. You don't need to create a separate username and password —
            just click the sign-in button and choose which account to use.
          </p>

          <h3 class={subSectionClass}>Creating or Joining a Household</h3>
          <p class={`${prose} mb-3`}>
            A <strong>household</strong>{" "}
            is your shared space in Foodex. It's where your recipes, pantry, and
            shopping lists live. Think of it as your kitchen — everyone in the
            household can see and contribute to it.
          </p>
          <p class={`${prose} mb-3`}>
            When you first sign in, you'll need to either:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-3">
            <li class={listItem}>
              <strong>Create a household</strong>{" "}
              — Give it a name (like "The Smiths" or "Apartment 4B") and you'll
              become the owner.
            </li>
            <li class={listItem}>
              <strong>Join an existing household</strong>{" "}
              — If someone you live with already has a household, they can give
              you an invite code. Enter it on the join page, and you're in.
            </li>
          </ul>
          <p class={`${prose} text-sm text-stone-500`}>
            You can belong to one household at a time.
          </p>
        </section>

        {/* ── Recipes ── */}
        <section id="recipes">
          <h2 class={sectionClass}>Recipes</h2>

          <h3 class={subSectionClass}>Browsing Recipes</h3>
          <p class={`${prose} mb-4`}>
            The main page of Foodex shows all your recipes. Each recipe card
            shows the title, a cover photo (if one was added), the difficulty
            level, and relevant tags. Recipes are shown 20 per page — use the
            page controls at the bottom to see more.
          </p>

          <h3 class={subSectionClass}>Searching and Filtering</h3>
          <p class={`${prose} mb-3`}>
            At the top of the recipe list, you can narrow down what you're
            looking for:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={listItem}>
              <strong>Search</strong>{" "}
              — Type a word or phrase to search across recipe titles,
              ingredients, and steps.
            </li>
            <li class={listItem}>
              <strong>Difficulty</strong> — Filter by Easy, Medium, or Hard.
            </li>
            <li class={listItem}>
              <strong>Meal type</strong>{" "}
              — Show only Breakfast, Lunch, Dinner, Snacks, or Dessert recipes
              (you can select more than one).
            </li>
            <li class={listItem}>
              <strong>Dietary needs</strong>{" "}
              — Filter by Vegetarian, Vegan, Gluten-Free, Dairy-Free, Nut-Free,
              and more.
            </li>
            <li class={listItem}>
              <strong>Favorites only</strong>{" "}
              — Show only the recipes you've marked as favorites.
            </li>
            <li class={listItem}>
              <strong>Cookable</strong>{" "}
              — Shows only recipes where you already have <strong>all</strong>
              {" "}
              the required ingredients in your pantry. Perfect for answering
              "what can I make right now?"
            </li>
          </ul>

          <h3 class={subSectionClass}>Viewing a Recipe</h3>
          <p class={`${prose} mb-3`}>When you open a recipe, you'll see:</p>
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={listItem}>
              <strong>Cover photo</strong> — Click it to see a larger version.
            </li>
            <li class={listItem}>
              <strong>Description</strong> — A brief summary of the dish.
            </li>
            <li class={listItem}>
              <strong>Details</strong>{" "}
              — Prep time, cook time, difficulty, and tags.
            </li>
            <li class={listItem}>
              <strong>Ingredients</strong>{" "}
              — Everything you need, with exact amounts. Ingredients already in
              your pantry are marked with a green checkmark.
            </li>
            <li class={listItem}>
              <strong>Steps</strong>{" "}
              — Numbered instructions. Some steps include photos.
            </li>
            <li class={listItem}>
              <strong>Tools</strong>{" "}
              — Any kitchen tools needed (like a whisk or baking tray).
            </li>
            <li class={listItem}>
              <strong>Cost estimate</strong>{" "}
              — If ingredient prices have been entered, you'll see an estimated
              total cost.
            </li>
          </ul>

          <h3 class={subSectionClass}>Scaling a Recipe</h3>
          <p class={`${prose} mb-3`}>
            Every recipe has a quantity control (usually a serving count). If a
            recipe serves 4 but you need to cook for 6, just change the number.
            All ingredient amounts will automatically adjust.
          </p>
          <p class={`${prose} mb-4`}>
            Some recipes use different quantity types: <strong>servings</strong>
            {" "}
            (the most common), <strong>weight</strong>{" "}
            (for things like bread dough), <strong>volume</strong>{" "}
            (for liquids like soup), or <strong>custom dimensions</strong>.
          </p>

          <h3 class={subSectionClass}>Timers</h3>
          <p class={`${prose} mb-4`}>
            Some recipe steps include built-in timers. For example, a step might
            say "bake for 15 minutes" with a timer button next to it. Click the
            button to start a countdown — it'll alert you when time's up. No
            need to set a separate timer on your phone. You can run multiple
            timers at the same time.
          </p>

          <h3 class={subSectionClass}>Creating a Recipe</h3>
          <p class={`${prose} mb-3`}>
            Click <strong>New Recipe</strong>{" "}
            to create one from scratch. You'll fill in:
          </p>
          <ol class="list-decimal pl-6 space-y-1 mb-3">
            <li class={listItem}>
              <strong>Title</strong> — The name of your dish.
            </li>
            <li class={listItem}>
              <strong>Description</strong>{" "}
              — A short summary (optional but helpful).
            </li>
            <li class={listItem}>
              <strong>Cover image</strong>{" "}
              — Upload a photo of the finished dish. You can crop it before
              saving.
            </li>
            <li class={listItem}>
              <strong>Difficulty</strong> — Easy, Medium, or Hard.
            </li>
            <li class={listItem}>
              <strong>Prep time and Cook time</strong>{" "}
              — How long each phase takes, in minutes.
            </li>
            <li class={listItem}>
              <strong>Meal type</strong>{" "}
              — Breakfast, Lunch, Dinner, etc. You can select multiple.
            </li>
            <li class={listItem}>
              <strong>Dietary tags</strong>{" "}
              — Mark if it's Vegetarian, Gluten-Free, etc.
            </li>
            <li class={listItem}>
              <strong>Quantity type</strong>{" "}
              — Usually "servings" with a number (like 4).
            </li>
            <li class={listItem}>
              <strong>Ingredients</strong>{" "}
              — Add each ingredient one by one. For each, pick from the database
              (or add a new one), set the amount, and choose a unit.
            </li>
            <li class={listItem}>
              <strong>Steps</strong>{" "}
              — Write each step. You can add a photo and specify tools for any
              step.
            </li>
            <li class={listItem}>
              <strong>Private</strong>{" "}
              — Toggle on if you want it visible only to your household.
            </li>
          </ol>
          <p class={`${prose} mb-4`}>
            When you're happy, save the recipe. It will appear in your recipe
            list.
          </p>

          <div class="card mb-4">
            <h4 class="font-bold mb-2">Advanced: Templates in Steps</h4>
            <p class="text-sm text-stone-600 dark:text-stone-400 mb-2">
              When writing recipe steps, you can reference ingredients by
              wrapping their name in double curly braces, like{" "}
              <code class="code-hint">{"{{ flour }}"}</code>. When someone views
              the recipe and changes the serving size, those references
              automatically update to show the correct scaled amount.
            </p>
            <p class="text-sm text-stone-600 dark:text-stone-400">
              For example, instead of writing "Add 200g of flour", you could
              write "Add {"{{ flour }}"}{" "}
              of flour" — and if someone doubles the recipe, it'll automatically
              show "Add 400g of flour". See the{" "}
              <a href="/docs/templates" class="link">
                Template Syntax reference
              </a>{" "}
              for full details.
            </p>
          </div>

          <h3 class={subSectionClass}>Editing and Cloning Recipes</h3>
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={listItem}>
              <strong>Edit</strong>{" "}
              — Open a recipe and click Edit to change anything about it.
            </li>
            <li class={listItem}>
              <strong>Clone</strong>{" "}
              — Create a copy you can modify without changing the original.
              Great for variations like "Mom's pasta sauce — spicy version".
            </li>
          </ul>

          <h3 class={subSectionClass}>Importing a Recipe from a Photo</h3>
          <p class={`${prose} mb-3`}>
            Have a recipe in a cookbook, on a card, or in a magazine? Photograph
            it and let Foodex extract it automatically:
          </p>
          <ol class="list-decimal pl-6 space-y-1 mb-3">
            <li class={listItem}>
              Go to <strong>Import Recipe</strong>.
            </li>
            <li class={listItem}>
              Upload one or more photos. You can crop each one to focus on the
              text.
            </li>
            <li class={listItem}>
              Foodex uses AI to read the text and pull out the title,
              ingredients, steps, and other details.
            </li>
            <li class={listItem}>
              The result appears as a <strong>draft</strong>{" "}
              that you can review and edit before publishing.
            </li>
          </ol>
          <p class={`${prose} text-sm text-stone-500 mb-4`}>
            Always double-check the extracted recipe, especially ingredient
            amounts. AI is helpful but not perfect.
          </p>

          <h3 class={subSectionClass}>Generating a Recipe with AI</h3>
          <p class={`${prose} mb-3`}>
            Generate a brand-new recipe based on what's currently in your
            pantry:
          </p>
          <ol class="list-decimal pl-6 space-y-1 mb-3">
            <li class={listItem}>
              Go to your <strong>Pantry</strong> page.
            </li>
            <li class={listItem}>
              Click <strong>Generate Recipe</strong>{" "}
              (only appears if your pantry has items).
            </li>
            <li class={listItem}>
              Optionally set a maximum cooking time or special instructions
              (e.g., "something spicy" or "a simple weeknight dinner").
            </li>
            <li class={listItem}>
              Foodex suggests a recipe using ingredients you already have.
            </li>
            <li class={listItem}>
              Review, tweak, and publish the draft.
            </li>
          </ol>

          <h3 class={subSectionClass}>Drafts</h3>
          <p class={`${prose} mb-4`}>
            When you import or generate a recipe, it starts as a{" "}
            <strong>draft</strong>. Drafts appear in a separate section on your
            recipe list and are only visible to you. Open a draft to edit it,
            then publish it when you're satisfied.
          </p>

          <h3 class={subSectionClass}>Favorites</h3>
          <p class={`${prose} mb-4`}>
            Click the heart icon on any recipe to mark it as a favorite. Your
            favorites are personal — other household members have their own. Use
            the "Favorites only" filter to quickly find recipes you've saved.
          </p>

          <h3 class={subSectionClass}>Private Recipes</h3>
          <p class={`${prose} mb-0`}>
            When creating or editing a recipe, you can mark it as{" "}
            <strong>private</strong>. Private recipes are only visible to your
            household members. Useful for secret family recipes or works in
            progress.
          </p>
        </section>

        {/* ── Pantry ── */}
        <section id="pantry">
          <h2 class={sectionClass}>Your Pantry</h2>
          <p class={`${prose} mb-4`}>
            The pantry is a shared inventory of what's currently in your
            household's kitchen. Everyone in the household sees and can update
            the same pantry.
          </p>

          <h3 class={subSectionClass}>Adding Items</h3>
          <p class={`${prose} mb-3`}>To add something to your pantry:</p>
          <ol class="list-decimal pl-6 space-y-1 mb-3">
            <li class={listItem}>
              Go to the <strong>Pantry</strong>{" "}
              page (found under your household).
            </li>
            <li class={listItem}>
              Search for the ingredient you want to add.
            </li>
            <li class={listItem}>
              Set the amount and unit (e.g., 500g of flour, 2L of milk).
            </li>
            <li class={listItem}>
              Optionally set an <strong>expiration date</strong>.
            </li>
            <li class={listItem}>Save it.</li>
          </ol>
          <p class={`${prose} text-sm text-stone-500 mb-4`}>
            If the ingredient doesn't exist in the database yet, you can create
            a new one on the spot.
          </p>

          <h3 class={subSectionClass}>Barcode Scanning</h3>
          <p class={`${prose} mb-3`}>
            One of the most convenient features. When you get home from
            shopping:
          </p>
          <ol class="list-decimal pl-6 space-y-1 mb-3">
            <li class={listItem}>
              Open the <strong>Pantry</strong> page.
            </li>
            <li class={listItem}>
              Click the <strong>Scan Barcode</strong> button.
            </li>
            <li class={listItem}>
              Point your device's camera at the barcode on a product.
            </li>
            <li class={listItem}>
              Foodex looks up the product automatically and fills in the
              ingredient name, brand, and quantity.
            </li>
            <li class={listItem}>
              Confirm or adjust the details and add it to your pantry.
            </li>
          </ol>
          <p class={`${prose} text-sm text-stone-500 mb-4`}>
            Works on any device with a camera — phones, tablets, and laptops.
            Fastest on a phone since you can scan items as you unpack groceries.
          </p>

          <h3 class={subSectionClass}>Expiration Tracking</h3>
          <p class={`${prose} mb-4`}>
            If you set expiration dates on pantry items, Foodex will warn you
            when something is about to expire or has already expired. This helps
            reduce food waste — plan meals around ingredients that need to be
            used up soon.
          </p>

          <h3 class={subSectionClass}>Merging Duplicates</h3>
          <p class={prose}>
            Sometimes you might end up with two entries for the same ingredient
            (maybe one was scanned and another typed in). You can merge
            duplicate pantry entries to combine their amounts into one item.
          </p>
        </section>

        {/* ── Shopping Lists ── */}
        <section id="shopping-lists">
          <h2 class={sectionClass}>Shopping Lists</h2>

          <h3 class={subSectionClass}>How Items Get Added</h3>
          <p class={`${prose} mb-3`}>
            There are two ways items end up on your shopping list:
          </p>
          <ol class="list-decimal pl-6 space-y-1 mb-4">
            <li class={listItem}>
              <strong>From a recipe</strong>{" "}
              — When you view a recipe and see that you're missing some
              ingredients, add the missing ones to your shopping list with one
              click. The list remembers which recipe they're for.
            </li>
            <li class={listItem}>
              <strong>Manually</strong>{" "}
              — Add items directly for things that aren't tied to a specific
              recipe.
            </li>
          </ol>

          <h3 class={subSectionClass}>Using Your Shopping List</h3>
          <p class={`${prose} mb-3`}>
            Your shopping list can be viewed in two ways:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-3">
            <li class={listItem}>
              <strong>Grouped by store</strong>{" "}
              — Items organized by which store has the best price. Helpful if
              you shop at multiple stores.
            </li>
            <li class={listItem}>
              <strong>Grouped by recipe</strong>{" "}
              — Items organized by which recipe needs them. Helpful for
              planning.
            </li>
          </ul>
          <p class={`${prose} mb-4`}>
            As you shop, check off items by tapping them. Checked items move to
            the bottom so you can focus on what's left. If prices have been
            entered, you'll see a running total of your estimated shopping cost.
          </p>

          <h3 class={subSectionClass}>Sharing Your Shopping List</h3>
          <p class={prose}>
            Need someone else to pick things up? Generate a{" "}
            <strong>share link</strong>. Anyone with the link can view the list
            (but not edit it) — they don't even need a Foodex account. Perfect
            for texting to a partner or roommate.
          </p>
        </section>

        {/* ── Household Management ── */}
        <section id="household">
          <h2 class={sectionClass}>Household Management</h2>
          <p class={`${prose} mb-4`}>
            Your household is the hub that connects you with the people you cook
            with.
          </p>

          <h3 class={subSectionClass}>Inviting Members</h3>
          <p class={`${prose} mb-3`}>To invite someone to your household:</p>
          <ol class="list-decimal pl-6 space-y-1 mb-3">
            <li class={listItem}>
              Go to your <strong>Household</strong> page.
            </li>
            <li class={listItem}>
              Generate an <strong>invite code</strong>.
            </li>
            <li class={listItem}>
              Share the code with the person you want to invite.
            </li>
            <li class={listItem}>
              They go to the join page and enter the code.
            </li>
          </ol>
          <p class={`${prose} text-sm text-stone-500 mb-3`}>
            Invite codes expire after 7 days. If a code expires, just generate a
            new one.
          </p>
          <div class="card mb-4">
            <h4 class="font-bold mb-2">Roles</h4>
            <ul class="list-disc pl-6 space-y-1">
              <li class={listItem}>
                <strong>Owner</strong>{" "}
                — Full control. Can manage members, tools, stores, and all
                settings.
              </li>
              <li class={listItem}>
                <strong>Member</strong>{" "}
                — Can do everything else: add recipes, manage the pantry, use
                shopping lists.
              </li>
            </ul>
          </div>

          <h3 class={subSectionClass}>Managing Tools</h3>
          <p class={`${prose} mb-4`}>
            Your household has a list of kitchen tools (blender, stand mixer,
            baking trays, etc.). When you create a recipe, you can specify which
            tools are needed for each step. This way, if you're browsing
            recipes, you'll know if you have the right equipment. Go to the{" "}
            <strong>Household</strong> page to add or remove tools.
          </p>

          <h3 class={subSectionClass}>Managing Stores</h3>
          <p class={`${prose} mb-3`}>
            Stores are the shops where you buy ingredients (like "Walmart",
            "Tesco", or "Local Farmer's Market"). Each store has a currency
            setting. Adding stores lets you:
          </p>
          <ul class="list-disc pl-6 space-y-1">
            <li class={listItem}>
              Track ingredient prices at each store.
            </li>
            <li class={listItem}>
              See which store is cheapest for each item on your shopping list.
            </li>
            <li class={listItem}>
              Organize your shopping list by store.
            </li>
          </ul>
        </section>

        {/* ── Ingredients & Prices ── */}
        <section id="ingredients-and-prices">
          <h2 class={sectionClass}>Ingredients &amp; Prices</h2>
          <p class={`${prose} mb-4`}>
            Foodex has a shared ingredient database. When you add an ingredient
            to a recipe or your pantry, you're picking from this database.
          </p>

          <h3 class={subSectionClass}>Browsing Ingredients</h3>
          <p class={`${prose} mb-4`}>
            Go to the <strong>Ingredients</strong>{" "}
            page to see all available ingredients. You can search by name and
            page through the full list.
          </p>

          <h3 class={subSectionClass}>Adding New Ingredients</h3>
          <p class={`${prose} mb-3`}>
            If an ingredient isn't in the database, you can add it:
          </p>
          <ul class="list-disc pl-6 space-y-1 mb-4">
            <li class={listItem}>
              <strong>Name</strong>{" "}
              — What it's called (e.g., "All-purpose flour").
            </li>
            <li class={listItem}>
              <strong>Unit</strong>{" "}
              — The standard unit it's measured in (grams, milliliters, pieces,
              etc.).
            </li>
            <li class={listItem}>
              <strong>Density</strong>{" "}
              — Optional. Lets Foodex convert between weight and volume (e.g.,
              how many cups equal 200g of flour).
            </li>
          </ul>

          <h3 class={subSectionClass}>Tracking Prices</h3>
          <p class={`${prose} mb-3`}>
            On an ingredient's detail page, you can add prices:
          </p>
          <ul class="list-disc pl-6 space-y-1">
            <li class={listItem}>
              Pick a <strong>store</strong> from your household's store list.
            </li>
            <li class={listItem}>
              Enter the <strong>brand</strong>{" "}
              (optional — e.g., "King Arthur" vs. store brand).
            </li>
            <li class={listItem}>
              Enter the <strong>price</strong> and the <strong>amount</strong>
              {" "}
              you get for that price.
            </li>
          </ul>
          <p class={`${prose} text-sm text-stone-500 mt-2`}>
            This price information powers the cost estimates on recipes and
            shopping lists.
          </p>
        </section>

        {/* ── Settings ── */}
        <section id="settings">
          <h2 class={sectionClass}>Settings</h2>

          <h3 class={subSectionClass}>Unit System</h3>
          <p class={`${prose} mb-4`}>
            Foodex supports both <strong>metric</strong>{" "}
            (grams, milliliters, centimeters) and <strong>imperial</strong>{" "}
            (ounces, fluid ounces, inches) units. Go to your{" "}
            <strong>Profile</strong>{" "}
            page to choose your preference. All recipes and ingredient amounts
            will display in your chosen system.
          </p>

          <h3 class={subSectionClass}>Dark Mode</h3>
          <p class={prose}>
            Click the dark mode toggle in the top navigation bar to switch
            between light and dark themes. Your preference is saved in your
            browser.
          </p>
        </section>

        {/* ── Tips & Tricks ── */}
        <section id="tips">
          <h2 class={sectionClass}>Tips &amp; Tricks</h2>
          <div class="space-y-4">
            <div class="card">
              <h4 class="font-bold mb-1">"What can I make?"</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                Use the <strong>Cookable</strong>{" "}
                filter on the recipe page to see only recipes where you have all
                the ingredients. The fastest way to decide what to cook.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Scan as you unpack</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                When you get home from the store, open the barcode scanner and
                scan items as you put them away. Takes seconds per item and
                keeps your pantry up to date.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Use expiration dates</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                Setting expiration dates on perishables helps you plan meals
                around what needs to be used first, reducing food waste.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Clone before modifying</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                Want to tweak a recipe? Clone it first. That way you keep the
                original and can compare.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Share your shopping list</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                Before someone heads to the store, share the shopping list link.
                They can check it on their phone without needing an account.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Check the green checkmarks</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                When viewing a recipe, green checkmarks next to ingredients mean
                you already have them. Only the unchecked ones need to be
                bought.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Let AI help</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                Not sure what to cook? Try generating a recipe from your pantry.
                You might discover a combination you hadn't thought of.
              </p>
            </div>
            <div class="card">
              <h4 class="font-bold mb-1">Add prices gradually</h4>
              <p class="text-sm text-stone-600 dark:text-stone-400">
                You don't have to enter all prices at once. Add them as you
                shop, and over time Foodex will give you accurate cost
                estimates.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});
