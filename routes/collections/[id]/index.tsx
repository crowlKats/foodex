import { HttpError, page } from "fresh";
import { define } from "../../../utils.ts";
import type {
  Collection,
  CollectionShare,
  RecipeTag,
  RecipeWithCover,
} from "../../../db/types.ts";
import { BackLink } from "../../../components/BackLink.tsx";
import ConfirmButton from "../../../islands/ConfirmButton.tsx";
import { formatDuration } from "../../../lib/duration.ts";
import { formatQuantity } from "../../../lib/quantity.ts";
import type { RecipeQuantity } from "../../../lib/quantity.ts";
import TbClock from "tb-icons/TbClock";
import TbFlame from "tb-icons/TbFlame";
import TbZzz from "tb-icons/TbZzz";
import TbUsers from "tb-icons/TbUsers";
import TbEdit from "tb-icons/TbEdit";
import TbShare from "tb-icons/TbShare";
import TbX from "tb-icons/TbX";

export const handler = define.handlers({
  async GET(ctx) {
    const id = ctx.params.id;
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const householdId = ctx.state.householdId;
    const collRes = await ctx.state.db.query<Collection>(
      "SELECT * FROM collections WHERE id = $1",
      [id],
    );
    if (collRes.rows.length === 0) throw new HttpError(404);
    const collection = collRes.rows[0];

    // Check access: owner or shared-to
    const isOwner = collection.household_id === householdId;
    if (!isOwner) {
      const shareRes = await ctx.state.db.query(
        "SELECT 1 FROM collection_shares WHERE collection_id = $1 AND household_id = $2",
        [id, householdId],
      );
      if (shareRes.rows.length === 0) throw new HttpError(404);
    }

    // Load recipes in collection
    const recipesRes = await ctx.state.db.query<RecipeWithCover>(
      `SELECT r.*, m.url as cover_image_url
       FROM collection_recipes cr
       JOIN recipes r ON r.id = cr.recipe_id
       LEFT JOIN media m ON m.id = r.cover_image_id
       WHERE cr.collection_id = $1
         AND (r.private = false OR r.household_id = $2)
       ORDER BY cr.sort_order, cr.id`,
      [id, householdId],
    );

    // Load tags for recipes
    const recipeIds = recipesRes.rows.map((r) => r.id);
    const tagsMap: Record<string, { meal_types: string[]; dietary: string[] }> =
      {};
    if (recipeIds.length > 0) {
      const tagsRes = await ctx.state.db.query<RecipeTag>(
        "SELECT recipe_id, tag_type, tag_value FROM recipe_tags WHERE recipe_id = ANY($1)",
        [recipeIds],
      );
      for (const t of tagsRes.rows) {
        if (!tagsMap[t.recipe_id]) {
          tagsMap[t.recipe_id] = { meal_types: [], dietary: [] };
        }
        if (t.tag_type === "meal_type") {
          tagsMap[t.recipe_id].meal_types.push(t.tag_value);
        } else if (t.tag_type === "dietary") {
          tagsMap[t.recipe_id].dietary.push(t.tag_value);
        }
      }
    }

    const recipes = recipesRes.rows.map((r) => ({
      ...r,
      tags: tagsMap[r.id] ?? { meal_types: [], dietary: [] },
    }));

    // Load shares
    let shares: CollectionShare[] = [];
    if (isOwner) {
      const sharesRes = await ctx.state.db.query<CollectionShare>(
        `SELECT cs.*, h.name as household_name, u.name as sharer_name
         FROM collection_shares cs
         JOIN households h ON h.id = cs.household_id
         JOIN users u ON u.id = cs.shared_by
         WHERE cs.collection_id = $1`,
        [id],
      );
      shares = sharesRes.rows;
    }

    ctx.state.pageTitle = collection.name;
    return page({ collection, recipes, isOwner, shares });
  },
  async POST(ctx) {
    const id = ctx.params.id;
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const method = form.get("_method") as string;

    // Verify ownership for mutating actions
    const collRes = await ctx.state.db.query<Collection>(
      "SELECT * FROM collections WHERE id = $1",
      [id],
    );
    if (collRes.rows.length === 0) throw new HttpError(404);
    const collection = collRes.rows[0];
    const isOwner = collection.household_id === ctx.state.householdId;

    if (method === "REMOVE_RECIPE" && isOwner) {
      const recipeId = String(form.get("recipe_id"));
      await ctx.state.db.query(
        "DELETE FROM collection_recipes WHERE collection_id = $1 AND recipe_id = $2",
        [id, recipeId],
      );
      await ctx.state.db.query(
        "UPDATE collections SET updated_at = now() WHERE id = $1",
        [id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/collections/${id}` },
      });
    }

    if (method === "GENERATE_SHARE_TOKEN" && isOwner) {
      const token = crypto.randomUUID();
      await ctx.state.db.query(
        "UPDATE collections SET share_token = $1, share_token_expires_at = now() + interval '30 days' WHERE id = $2",
        [token, id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/collections/${id}` },
      });
    }

    if (method === "REVOKE_SHARE_TOKEN" && isOwner) {
      await ctx.state.db.query(
        "UPDATE collections SET share_token = NULL, share_token_expires_at = NULL WHERE id = $1",
        [id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/collections/${id}` },
      });
    }

    if (method === "REVOKE_SHARE" && isOwner) {
      const shareId = String(form.get("share_id"));
      await ctx.state.db.query(
        "DELETE FROM collection_shares WHERE id = $1 AND collection_id = $2",
        [shareId, id],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: `/collections/${id}` },
      });
    }

    // Non-owner: leave shared collection
    if (method === "LEAVE" && !isOwner) {
      await ctx.state.db.query(
        "DELETE FROM collection_shares WHERE collection_id = $1 AND household_id = $2",
        [id, ctx.state.householdId],
      );
      return new Response(null, {
        status: 303,
        headers: { Location: "/collections" },
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/collections/${id}` },
    });
  },
});

export default define.page<typeof handler>(
  function CollectionDetail(
    { data: { collection, recipes, isOwner, shares }, url },
  ) {
    const shareUrl = collection.share_token
      ? `${url.origin}/collections/share/${collection.share_token}`
      : null;

    return (
      <div>
        <BackLink href="/collections" label="Back to Collections" />

        <div class="flex items-center gap-3 mt-4 mb-2">
          <h1 class="text-2xl font-bold flex-1">{collection.name}</h1>
          {isOwner && (
            shareUrl
              ? (
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    class="text-sm w-48 sm:w-64 select-all"
                  />
                  <form method="POST" class="inline">
                    <input
                      type="hidden"
                      name="_method"
                      value="REVOKE_SHARE_TOKEN"
                    />
                    <button
                      type="submit"
                      class="btn btn-outline text-sm inline-flex items-center gap-1.5"
                    >
                      <TbShare class="size-4" />
                      Unshare
                    </button>
                  </form>
                </div>
              )
              : (
                <form method="POST" class="inline">
                  <input
                    type="hidden"
                    name="_method"
                    value="GENERATE_SHARE_TOKEN"
                  />
                  <button
                    type="submit"
                    class="btn btn-outline text-sm inline-flex items-center gap-1.5"
                  >
                    <TbShare class="size-4" />
                    Share
                  </button>
                </form>
              )
          )}
          {isOwner && (
            <a
              href={`/collections/${collection.id}/edit`}
              class="btn btn-outline text-sm inline-flex items-center gap-1.5"
            >
              <TbEdit class="size-4" />
              Edit
            </a>
          )}
        </div>

        {collection.description && (
          <p class="text-stone-500 mb-4">{collection.description}</p>
        )}

        {isOwner && shares.length > 0 && (
          <div class="mb-6 space-y-1">
            <div class="text-xs font-medium text-stone-500">
              Shared with
            </div>
            {shares.map((s) => (
              <div
                key={s.id}
                class="flex items-center justify-between text-sm"
              >
                <span>{s.household_name}</span>
                <form method="POST" class="inline">
                  <input
                    type="hidden"
                    name="_method"
                    value="REVOKE_SHARE"
                  />
                  <input
                    type="hidden"
                    name="share_id"
                    value={String(s.id)}
                  />
                  <button
                    type="submit"
                    class="text-stone-400 hover:text-red-500 cursor-pointer"
                    title="Remove"
                  >
                    <TbX class="size-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        {/* Recipes */}
        <h2 class="text-lg font-semibold mb-3">
          Recipes ({recipes.length})
        </h2>
        {recipes.length === 0
          ? (
            <p class="text-stone-500">
              No recipes in this collection yet.
              {isOwner && (
                <>
                  {" "}
                  <a
                    href={`/collections/${collection.id}/edit`}
                    class="link"
                  >
                    Add some
                  </a>.
                </>
              )}
            </p>
          )
          : (
            <div class="space-y-2">
              {recipes.map((r) => (
                <div key={r.id} class="flex items-center gap-2">
                  <a
                    href={`/recipes/${r.slug}`}
                    class="block card card-hover flex-1"
                  >
                    <div class="flex items-center gap-3">
                      {r.cover_image_url && (
                        <img
                          src={r.cover_image_url}
                          alt={r.title}
                          class="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <div class="font-medium text-lg">
                          {r.title}
                          {r.private && (
                            <span class="ml-2 text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded align-middle">
                              private
                            </span>
                          )}
                        </div>
                        {(r.tags.meal_types.length > 0 ||
                          r.tags.dietary.length > 0) && (
                          <div class="flex flex-wrap gap-1 mt-1">
                            {r.tags.meal_types.map((mt) => (
                              <span
                                key={mt}
                                class="text-[10px] bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded capitalize"
                              >
                                {mt}
                              </span>
                            ))}
                            {r.tags.dietary.map((dt) => (
                              <span
                                key={dt}
                                class="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded capitalize"
                              >
                                {dt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div class="text-xs text-stone-400 mt-2 flex gap-4">
                      {r.difficulty && (
                        <span class="capitalize">{r.difficulty}</span>
                      )}
                      <span>
                        <TbUsers class="size-3.5 inline mr-0.5" />
                        {formatQuantity({
                          type:
                            (r.quantity_type || "servings") as RecipeQuantity[
                              "type"
                            ],
                          value: r.quantity_value ?? 4,
                          unit: r.quantity_unit || "servings",
                          value2: r.quantity_value2 != null
                            ? r.quantity_value2
                            : undefined,
                          value3: r.quantity_value3 != null
                            ? r.quantity_value3
                            : undefined,
                          unit2: r.quantity_unit2 ?? undefined,
                        })}
                      </span>
                      {r.prep_time != null && (
                        <span>
                          <TbClock class="size-3.5 inline mr-0.5" />Prep:{" "}
                          {formatDuration(r.prep_time)}
                        </span>
                      )}
                      {r.cook_time != null && (
                        <span>
                          <TbFlame class="size-3.5 inline mr-0.5" />Cook:{" "}
                          {formatDuration(r.cook_time)}
                        </span>
                      )}
                      {r.rest_time != null && (
                        <span>
                          <TbZzz class="size-3.5 inline mr-0.5" />Rest:{" "}
                          {formatDuration(r.rest_time)}
                        </span>
                      )}
                    </div>
                  </a>
                  {isOwner && (
                    <form method="POST" class="shrink-0">
                      <input
                        type="hidden"
                        name="_method"
                        value="REMOVE_RECIPE"
                      />
                      <input
                        type="hidden"
                        name="recipe_id"
                        value={String(r.id)}
                      />
                      <button
                        type="submit"
                        class="text-stone-400 hover:text-red-500 cursor-pointer p-1"
                        title="Remove from collection"
                      >
                        <TbX class="size-4" />
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

        {!isOwner && (
          <div class="mt-6">
            <form method="POST">
              <input type="hidden" name="_method" value="LEAVE" />
              <ConfirmButton
                message="Leave this shared collection?"
                class="btn btn-danger"
              >
                Leave Collection
              </ConfirmButton>
            </form>
          </div>
        )}
      </div>
    );
  },
);
