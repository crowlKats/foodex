import { handler, page } from "./$moving-box.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { SectionHeader } from "../components/SectionHeader.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Button } from "../components/Button.tsx";
import { BackLink } from "../components/BackLink.tsx";
import ConfirmButton from "../islands/ConfirmButton.tsx";
import { loginUrl } from "../lib/auth.ts";
import { packRecipe } from "../lib/moving-box.ts";
import { deleteFile } from "../lib/s3.ts";
import { logAudit } from "../lib/audit.ts";
import { pickBundle } from "../lib/i18n/locale.ts";
import en from "./moving-box.en.mfr";
import it from "./moving-box.it.mfr";

interface BoxItem {
  id: string;
  title: string;
  collection_names: string[];
  media_count: number;
  created_at: Date;
}

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl("/moving-box") },
      });
    }

    const [box, recipes, collections] = await Promise.all([
      ctx.state.db.query<BoxItem>(
        `SELECT id, title, collection_names,
                jsonb_array_length(media) AS media_count, created_at
         FROM moving_box_recipes WHERE user_id = $1 ORDER BY title`,
        [ctx.state.user.id],
      ),
      ctx.state.householdId
        ? ctx.state.db.query<{ id: string; title: string; private: boolean }>(
          `SELECT id, title, private FROM recipes
           WHERE household_id = $1 ORDER BY title`,
          [ctx.state.householdId],
        )
        : Promise.resolve({
          rows: [] as { id: string; title: string; private: boolean }[],
        }),
      ctx.state.householdId
        ? ctx.state.db.query<{ id: string; name: string; cnt: string }>(
          `SELECT c.id, c.name,
                  (SELECT COUNT(*) FROM collection_recipes cr
                    WHERE cr.collection_id = c.id) AS cnt
           FROM collections c WHERE c.household_id = $1 ORDER BY c.name`,
          [ctx.state.householdId],
        )
        : Promise.resolve({
          rows: [] as { id: string; name: string; cnt: string }[],
        }),
    ]);

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "movingBox.title",
    ).format();
    return {
      data: {
        box: box.rows,
        recipes: recipes.rows,
        collections: collections.rows,
        hasHousehold: ctx.state.householdId != null,
        msg: ctx.url.searchParams.get("msg") || undefined,
      },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: loginUrl("/moving-box") },
      });
    }
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));
    const q = ctx.state.db.query;

    if (method === "PACK" && ctx.state.householdId) {
      const recipeIds = form.getAll("recipe_ids").map(String);
      const collectionIds = form.getAll("collection_ids").map(String);
      let packed = 0;

      for (const cid of collectionIds) {
        const col = await q<{ name: string }>(
          "SELECT name FROM collections WHERE id = $1 AND household_id = $2",
          [cid, ctx.state.householdId],
        );
        if (col.rows.length === 0) continue;
        const inCol = await q<{ recipe_id: string }>(
          `SELECT cr.recipe_id FROM collection_recipes cr
           JOIN recipes r ON r.id = cr.recipe_id
           WHERE cr.collection_id = $1 AND r.household_id = $2`,
          [cid, ctx.state.householdId],
        );
        for (const row of inCol.rows) {
          if (
            await packRecipe(q, ctx.state.user.id, row.recipe_id, [
              col.rows[0].name,
            ])
          ) packed++;
        }
      }

      for (const rid of recipeIds) {
        const owned = await q(
          "SELECT 1 FROM recipes WHERE id = $1 AND household_id = $2",
          [rid, ctx.state.householdId],
        );
        if (owned.rows.length === 0) continue;
        if (await packRecipe(q, ctx.state.user.id, rid, [])) packed++;
      }

      if (packed > 0) {
        await logAudit(q, ctx.state.user, {
          action: "user.pack_box",
          targetType: "user",
          targetId: ctx.state.user.id,
          targetLabel: `${ctx.state.user.name} <${
            ctx.state.user.email ?? "no email"
          }>`,
          detail: `packed ${packed} recipe${packed === 1 ? "" : "s"}`,
          householdId: ctx.state.householdId,
        });
      }
      return new Response(null, {
        status: 303,
        headers: {
          Location: `/moving-box?msg=${
            encodeURIComponent(
              `Packed ${packed} recipe${packed === 1 ? "" : "s"}.`,
            )
          }`,
        },
      });
    } else if (method === "REMOVE") {
      const boxId = String(form.get("box_id"));
      const removed = await q<{ media: { key: string }[] }>(
        `DELETE FROM moving_box_recipes
         WHERE id = $1 AND user_id = $2 RETURNING media`,
        [boxId, ctx.state.user.id],
      );
      if (removed.rows.length > 0) {
        // Best effort: the copies are box-scoped, nothing else references them.
        await Promise.allSettled(
          removed.rows[0].media.map((m) => deleteFile(m.key)),
        );
      }
    }

    return new Response(null, {
      status: 303,
      headers: { Location: "/moving-box" },
    });
  },
});

export default page(function MovingBoxPage(
  { data: { box, recipes, collections, hasHousehold, msg } },
) {
  return (
    <div class="max-w-3xl mx-auto">
      <PageHeader title="Moving Box" noSearch />
      <BackLink
        href={hasHousehold ? "/household" : "/households"}
        label={hasHousehold ? "Household" : "Get started"}
      />

      {msg && <div class="alert-success my-4">{msg}</div>}

      <p class="text-stone-500 my-4 text-sm">
        Moving out? Pack the recipes you want to keep. They're stored as copies,
        images included, so they survive leaving the household, and they unpack
        automatically into the next household you create or join. Packed
        collections come back as collections.
      </p>

      <div class="card mb-6">
        <SectionHeader title={`In the box (${box.length})`} />
        {box.length === 0
          ? (
            <p class="text-sm text-stone-500 mt-3">
              Nothing packed yet.
            </p>
          )
          : (
            <div class="mt-3 space-y-2">
              {box.map((b) => (
                <div key={b.id} class="flex items-center gap-2">
                  <div class="flex-1 min-w-0">
                    <span class="font-medium">{b.title}</span>
                    <span class="text-xs text-stone-400 ml-2">
                      {b.media_count > 0 &&
                        `${b.media_count} image${
                          b.media_count === 1 ? "" : "s"
                        }`}
                      {b.collection_names.length > 0 &&
                        ` · in ${b.collection_names.join(", ")}`}
                    </span>
                  </div>
                  <form method="POST">
                    <input type="hidden" name="_method" value="REMOVE" />
                    <input type="hidden" name="box_id" value={b.id} />
                    <ConfirmButton
                      message={`Take "${b.title}" out of the box? The packed copy is discarded.`}
                      variant="danger-ghost"
                      size="xs"
                    >
                      Remove
                    </ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        {!hasHousehold && box.length > 0 && (
          <p class="text-xs text-stone-400 mt-4">
            The box unpacks as soon as you create or join a household. A packed
            box also keeps your account around for 30 days instead of the usual
            7.
          </p>
        )}
      </div>

      {hasHousehold && (
        <form method="POST">
          <input type="hidden" name="_method" value="PACK" />
          <div class="grid gap-6 md:grid-cols-2">
            <div class="card">
              <SectionHeader title="Collections" />
              {collections.length === 0
                ? (
                  <p class="text-sm text-stone-500 mt-3">
                    No collections in this household.
                  </p>
                )
                : (
                  <div class="mt-3 space-y-1 max-h-72 overflow-y-auto">
                    {collections.map((c) => (
                      <label key={c.id} class="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="collection_ids"
                          value={c.id}
                        />
                        <span class="flex-1 truncate">{c.name}</span>
                        <span class="text-xs text-stone-400">
                          {Number(c.cnt)} recipe{Number(c.cnt) === 1 ? "" : "s"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
            </div>
            <div class="card">
              <SectionHeader title="Recipes" />
              {recipes.length === 0
                ? (
                  <p class="text-sm text-stone-500 mt-3">
                    No recipes in this household.
                  </p>
                )
                : (
                  <div class="mt-3 space-y-1 max-h-72 overflow-y-auto">
                    {recipes.map((r) => (
                      <label key={r.id} class="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="recipe_ids" value={r.id} />
                        <span class="flex-1 truncate">{r.title}</span>
                        {r.private && (
                          <span class="text-xs bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5">
                            private
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
            </div>
          </div>
          <div class="mt-4">
            <Button type="submit">Pack selected</Button>
          </div>
        </form>
      )}

      {!hasHousehold && (
        <EmptyState title="You're between households">
          {box.length > 0
            ? "Join or create a household and the box unpacks there."
            : "There's nothing packed. If you left a household without packing, ask a remaining member to share what you need."}
        </EmptyState>
      )}
    </div>
  );
});
