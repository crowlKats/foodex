import { handler, page } from "./$new.ts";
import type { Recipe } from "../../db/types.ts";
import { logAudit } from "../../lib/audit.ts";
import { BackLink } from "../../components/BackLink.tsx";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input, InputMultiline } from "../../components/Input.tsx";
import { Checkbox } from "../../components/Checkbox.tsx";
import MediaUpload from "../../islands/MediaUpload.tsx";
import RecipePicker from "../../islands/RecipePicker.tsx";
import { catalogFor } from "../../lib/i18n/mod.ts";

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const recipesRes = await ctx.state.db.query<Recipe>(
      `SELECT id, title FROM recipes
       WHERE private = false OR household_id = $1
       ORDER BY title`,
      [ctx.state.householdId],
    );

    ctx.state.pageTitle = catalogFor(ctx.state.locale).collections.newTitle();
    return {
      data: {
        allRecipes: recipesRes.rows,
        error: undefined as string | undefined,
      },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const description = form.get("description") as string;
    const coverImageId = form.get("cover_image_id") as string;
    const isPrivate = form.get("private") === "on";
    const recipeIds = form.getAll("recipe_id").map((v) => String(v))
      .filter((v) => v !== "");

    if (!name?.trim()) {
      const recipesRes = await ctx.state.db.query<Recipe>(
        `SELECT id, title FROM recipes
         WHERE private = false OR household_id = $1
         ORDER BY title`,
        [ctx.state.householdId],
      );
      return {
        data: { allRecipes: recipesRes.rows, error: "Name is required" },
      };
    }

    let collectionId: string;
    await ctx.state.db.transaction(async (q) => {
      const res = await q<{ id: string }>(
        `INSERT INTO collections (household_id, name, description, cover_image_id, private)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          ctx.state.householdId,
          name.trim(),
          description?.trim() || null,
          coverImageId || null,
          isPrivate,
        ],
      );
      collectionId = res.rows[0].id;

      for (let i = 0; i < recipeIds.length; i++) {
        await q(
          `INSERT INTO collection_recipes (collection_id, recipe_id, sort_order)
           VALUES ($1, $2, $3)`,
          [collectionId, recipeIds[i], i],
        );
      }
    });

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "collection.create",
      targetType: "collection",
      targetId: collectionId!,
      targetLabel: name.trim(),
      householdId: ctx.state.householdId,
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/collections/${collectionId!}` },
    });
  },
});

export default page(
  function NewCollectionPage({ data: { allRecipes, error } }) {
    return (
      <div>
        <BackLink href="/collections" label="Back to Collections" />

        <h1 class="text-2xl font-bold mt-4 mb-6">New Collection</h1>

        {error && <div class="alert-error mb-4">{error}</div>}

        <form method="POST" class="space-y-6">
          <div class="card">
            <h2 class="font-semibold mb-2">Cover Image</h2>
            <MediaUpload name="cover_image_id" accept="image/*" />
          </div>

          <div class="card space-y-3">
            <h2 class="font-semibold">Details</h2>
            <FormField label="Name">
              <Input type="text" name="name" required class="w-full" />
            </FormField>
            <FormField label="Description">
              <InputMultiline name="description" rows={2} class="w-full" />
            </FormField>
            <Checkbox
              name="private"
              class="mt-3"
              label="Private (only visible to household members and shared households)"
            />
          </div>

          <div class="card">
            <h2 class="font-semibold mb-2">Recipes</h2>
            <RecipePicker
              options={allRecipes.map((r) => ({
                id: String(r.id),
                title: r.title,
              }))}
            />
          </div>

          <Button type="submit">
            Create Collection
          </Button>
        </form>
      </div>
    );
  },
);
