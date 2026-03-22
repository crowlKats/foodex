import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import type {
  Ingredient,
  Media,
  Recipe,
  RecipeDraft,
  Tool,
} from "../../../db/types.ts";
import type { OcrRecipeData } from "../../../lib/ocr.ts";
import { saveRecipeChildren } from "../../../lib/recipe-save.ts";
import DraftEditor from "../../../islands/DraftEditor.tsx";
import { BackLink } from "../../../components/BackLink.tsx";

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const draftRes = await ctx.state.db.query<RecipeDraft>(
      "SELECT * FROM recipe_drafts WHERE id = $1 AND household_id = $2",
      [ctx.params.id, ctx.state.householdId],
    );
    if (draftRes.rows.length === 0) throw new HttpError(404);
    const draft = draftRes.rows[0];

    const [ingredientsRes, allToolsRes, allRecipesRes] = await Promise.all([
      ctx.state.db.query<Ingredient>(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      ),
      ctx.state.db.query<Tool>(
        "SELECT id, name FROM tools ORDER BY name",
      ),
      ctx.state.db.query<Recipe>(
        "SELECT id, title, slug FROM recipes ORDER BY title",
      ),
    ]);

    let coverImage: {
      id: string;
      url: string;
      filename: string;
      content_type: string;
    } | null = null;
    if (draft.cover_image_id) {
      const mediaRes = await ctx.state.db.query<Media>(
        "SELECT id, url, filename, content_type FROM media WHERE id = $1",
        [draft.cover_image_id],
      );
      if (mediaRes.rows.length > 0) {
        const m = mediaRes.rows[0];
        coverImage = {
          id: String(m.id),
          url: m.url,
          filename: m.filename ?? "",
          content_type: m.content_type,
        };
      }
    }

    const recipeData = draft.recipe_data as unknown as OcrRecipeData;
    const title = recipeData?.title;
    ctx.state.pageTitle = title ? `Draft: ${title}` : "Draft";

    return page({
      draft,
      recipeData,
      coverImage,
      ingredients: ingredientsRes.rows,
      allTools: allToolsRes.rows,
      allRecipes: allRecipesRes.rows,
    });
  },

  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const draftId = ctx.params.id;
    const title = form.get("title") as string;
    const slug = slugify(title || "");
    const description = form.get("description") as string;
    const quantityType = (form.get("quantity_type") as string) || "servings";
    const quantityValue = parseFloat(form.get("quantity_value") as string) || 4;
    const quantityUnit = (form.get("quantity_unit") as string) || "servings";
    const quantityValue2Raw = form.get("quantity_value2") as string;
    const quantityValue2 = quantityValue2Raw
      ? parseFloat(quantityValue2Raw)
      : null;
    const quantityValue3Raw = form.get("quantity_value3") as string;
    const quantityValue3 = quantityValue3Raw
      ? parseFloat(quantityValue3Raw)
      : null;
    const quantityUnit2 = (form.get("quantity_unit2") as string) || null;
    const prepTimeRaw = form.get("prep_time") as string;
    const prepTimeUnit = form.get("prep_time_unit") as string;
    const prepTime = prepTimeRaw
      ? Math.round(parseFloat(prepTimeRaw) * (prepTimeUnit === "hr" ? 60 : 1))
      : null;
    const cookTimeRaw = form.get("cook_time") as string;
    const cookTimeUnit = form.get("cook_time_unit") as string;
    const cookTime = cookTimeRaw
      ? Math.round(parseFloat(cookTimeRaw) * (cookTimeUnit === "hr" ? 60 : 1))
      : null;
    const coverImageId = form.get("cover_image_id") as string;
    const difficulty = (form.get("difficulty") as string) || null;
    const isPrivate = form.get("private") === "on";

    if (!title?.trim()) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: `/recipes/drafts/${draftId}?error=${
            encodeURIComponent("Title is required")
          }`,
        },
      });
    }

    try {
      await ctx.state.db.transaction(async (q) => {
        const res = await q<{ id: number }>(
          `INSERT INTO recipes (title, slug, description, quantity_type, quantity_value, quantity_unit, quantity_value2, quantity_value3, quantity_unit2, prep_time, cook_time, cover_image_id, difficulty, household_id, private)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [
            title.trim(),
            slug,
            description?.trim() || null,
            quantityType,
            quantityValue,
            quantityUnit,
            quantityValue2,
            quantityValue3,
            quantityUnit2,
            prepTime,
            cookTime,
            coverImageId ? parseInt(coverImageId) : null,
            difficulty,
            ctx.state.householdId,
            isPrivate,
          ],
        );
        await saveRecipeChildren(q, res.rows[0].id, form);

        // Delete the draft
        await q(
          "DELETE FROM recipe_drafts WHERE id = $1 AND household_id = $2",
          [draftId, ctx.state.householdId],
        );
      });
    } catch (err) {
      if (String(err).includes("unique")) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/recipes/drafts/${draftId}?error=${
              encodeURIComponent(`Slug "${slug}" already exists`)
            }`,
          },
        });
      }
      throw err;
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/recipes/${slug}` },
    });
  },
});

export default define.page<typeof handler>(
  function DraftPage(
    {
      data: {
        draft,
        recipeData,
        coverImage,
        ingredients,
        allTools,
        allRecipes,
      },
      url,
    },
  ) {
    const error = url.searchParams.get("error");

    return (
      <div>
        <div class="flex items-center gap-4 mb-4">
          <BackLink href="/recipes" label="Back to Recipes" />
        </div>

        <h1 class="text-2xl font-bold mb-4">
          {recipeData.title ? `Draft: ${recipeData.title}` : "New Draft"}
        </h1>

        {error && <div class="alert-error mb-4">{error}</div>}

        <DraftEditor
          draftId={draft.id}
          initialRecipe={recipeData}
          aiMessages={draft.ai_messages}
          hasAi={draft.source === "ocr" || draft.source === "generate"}
          coverImage={coverImage}
          ingredients={ingredients.map((g) => ({
            id: String(g.id),
            name: g.name,
            unit: g.unit ?? "",
          }))}
          allTools={allTools.map((t) => ({
            id: String(t.id),
            name: t.name,
          }))}
          allRecipes={allRecipes.map((r) => ({
            id: String(r.id),
            title: r.title,
          }))}
        />
      </div>
    );
  },
);
