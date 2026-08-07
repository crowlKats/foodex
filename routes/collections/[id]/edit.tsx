import { handler, page } from "./$edit.ts";
import { HttpError } from "fresh/errors";
import type { Collection, Recipe } from "../../../db/types.ts";
import { BackLink } from "../../../components/BackLink.tsx";
import { FormField } from "../../../components/FormField.tsx";
import { Button } from "../../../components/Button.tsx";
import { Input, InputMultiline } from "../../../components/Input.tsx";
import { Checkbox } from "../../../components/Checkbox.tsx";
import MediaUpload from "../../../islands/MediaUpload.tsx";
import RecipePicker from "../../../islands/RecipePicker.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { logAudit } from "../../../lib/audit.ts";

export const handlers = handler({
  async GET(ctx) {
    const id = ctx.params.id;
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const collRes = await ctx.state.db.query<
      Collection & {
        cover_media_id: string | null;
        cover_media_url: string | null;
        cover_media_filename: string | null;
        cover_media_content_type: string | null;
      }
    >(
      `SELECT c.*, m.id as cover_media_id, m.url as cover_media_url,
              m.filename as cover_media_filename, m.content_type as cover_media_content_type
       FROM collections c
       LEFT JOIN media m ON m.id = c.cover_image_id
       WHERE c.id = $1 AND c.household_id = $2`,
      [id, ctx.state.householdId],
    );
    if (collRes.rows.length === 0) throw new HttpError(404);

    const currentRecipesRes = await ctx.state.db.query<
      { recipe_id: string; title: string }
    >(
      `SELECT cr.recipe_id, r.title
       FROM collection_recipes cr
       JOIN recipes r ON r.id = cr.recipe_id
       WHERE cr.collection_id = $1
       ORDER BY cr.sort_order, cr.id`,
      [id],
    );

    const allRecipesRes = await ctx.state.db.query<Recipe>(
      `SELECT id, title FROM recipes
       WHERE private = false OR household_id = $1
       ORDER BY title`,
      [ctx.state.householdId],
    );

    ctx.state.pageTitle = `Edit ${collRes.rows[0].name}`;
    return {
      data: {
        collection: collRes.rows[0],
        currentRecipes: currentRecipesRes.rows,
        allRecipes: allRecipesRes.rows,
      },
    };
  },
  async POST(ctx) {
    const id = ctx.params.id;
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    // Verify ownership
    const collRes = await ctx.state.db.query<{ name: string }>(
      "SELECT name FROM collections WHERE id = $1 AND household_id = $2",
      [id, ctx.state.householdId],
    );
    if (collRes.rows.length === 0) throw new HttpError(404);
    const currentName = collRes.rows[0].name;

    const form = await ctx.req.formData();
    const method = form.get("_method") as string;

    if (method === "DELETE") {
      await ctx.state.db.query("DELETE FROM collections WHERE id = $1", [id]);
      await logAudit(ctx.state.db.query, ctx.state.user, {
        action: "collection.delete",
        targetType: "collection",
        targetId: id,
        targetLabel: currentName,
        householdId: ctx.state.householdId,
      });
      return new Response(null, {
        status: 303,
        headers: { Location: "/collections" },
      });
    }

    const name = form.get("name") as string;
    const description = form.get("description") as string;
    const coverImageId = form.get("cover_image_id") as string;
    const isPrivate = form.get("private") === "on";
    const recipeIds = form.getAll("recipe_id").map((v) => String(v))
      .filter((v) => v !== "");

    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: `/collections/${id}/edit` },
      });
    }

    await ctx.state.db.transaction(async (q) => {
      await q(
        `UPDATE collections SET name = $1, description = $2, cover_image_id = $3, private = $4, updated_at = now()
         WHERE id = $5`,
        [
          name.trim(),
          description?.trim() || null,
          coverImageId || null,
          isPrivate,
          id,
        ],
      );

      // Sync recipes: delete all and re-insert with new order
      await q("DELETE FROM collection_recipes WHERE collection_id = $1", [id]);
      for (let i = 0; i < recipeIds.length; i++) {
        await q(
          `INSERT INTO collection_recipes (collection_id, recipe_id, sort_order)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [id, recipeIds[i], i],
        );
      }
    });

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "collection.update",
      targetType: "collection",
      targetId: id,
      targetLabel: name.trim(),
      householdId: ctx.state.householdId,
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/collections/${id}` },
    });
  },
});

export default page(
  function EditCollectionPage(
    { data: { collection, currentRecipes, allRecipes } },
  ) {
    return (
      <div>
        <BackLink
          href={`/collections/${collection.id}`}
          label="Back to Collection"
        />

        <h1 class="text-2xl font-bold mt-4 mb-6">Edit {collection.name}</h1>

        <form id="edit-form" method="POST" class="space-y-6">
          <div class="card">
            <h2 class="font-semibold mb-2">Cover Image</h2>
            <MediaUpload
              name="cover_image_id"
              accept="image/*"
              initialMedia={collection.cover_media_id
                ? [{
                  id: String(collection.cover_media_id),
                  url: collection.cover_media_url!,
                  filename: collection.cover_media_filename!,
                  content_type: collection.cover_media_content_type!,
                }]
                : []}
            />
          </div>

          <div class="card space-y-3">
            <h2 class="font-semibold">Details</h2>
            <FormField label="Name">
              <Input
                type="text"
                name="name"
                value={collection.name}
                required
                class="w-full"
              />
            </FormField>
            <FormField label="Description">
              <InputMultiline
                name="description"
                rows={2}
                class="w-full"
                value={collection.description ?? ""}
              />
            </FormField>
            <Checkbox
              name="private"
              checked={collection.private}
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
              initialSelected={currentRecipes.map((r) => ({
                id: String(r.recipe_id),
                title: r.title,
              }))}
            />
          </div>
        </form>

        <div class="flex items-center justify-between">
          <Button type="submit" form="edit-form">
            Save Changes
          </Button>
          <form method="POST">
            <input type="hidden" name="_method" value="DELETE" />
            <ConfirmButton
              message="Delete this collection and all its recipe associations?"
              variant="danger"
            >
              Delete Collection
            </ConfirmButton>
          </form>
        </div>
      </div>
    );
  },
);
