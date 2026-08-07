import { handler, page } from "./$recipes.ts";
import { escapeLike } from "../../utils.ts";
import { AdminNav } from "../../components/AdminNav.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import ConfirmButton from "../../islands/ConfirmButton.tsx";
import { logAudit } from "../../lib/audit.ts";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";

interface RecipeRow {
  id: string;
  slug: string;
  title: string;
  private: boolean;
  created_at: Date;
  household: string | null;
  household_id: string | null;
}

const LIST_SQL = `
  SELECT r.id, r.slug, r.title, r.private, r.created_at,
         h.name AS household, h.id AS household_id
  FROM recipes r
  LEFT JOIN households h ON h.id = r.household_id`;

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    let result, countRes;
    if (q) {
      const escaped = escapeLike(q);
      [result, countRes] = await Promise.all([
        ctx.state.db.query<RecipeRow>(
          `${LIST_SQL} WHERE r.title ILIKE '%' || $1 || '%' ESCAPE '\\'
           ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
          [escaped, limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM recipes r
           WHERE r.title ILIKE '%' || $1 || '%' ESCAPE '\\'`,
          [escaped],
        ),
      ]);
    } else {
      [result, countRes] = await Promise.all([
        ctx.state.db.query<RecipeRow>(
          `${LIST_SQL} ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM recipes",
        ),
      ]);
    }

    ctx.state.pageTitle = "Admin: Recipes";
    return {
      data: {
        recipes: result.rows,
        q,
        currentPage,
        totalCount: Number(countRes.rows[0].cnt),
      },
    };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const method = String(form.get("_method"));
    if (method === "DELETE") {
      const recipeId = String(form.get("recipe_id"));
      const deleted = await ctx.state.db.query<{
        title: string;
        slug: string;
      }>(
        "DELETE FROM recipes WHERE id = $1 RETURNING title, slug",
        [recipeId],
      );
      if (deleted.rows.length > 0) {
        await logAudit(ctx.state.db.query, ctx.state.adminUser, {
          source: "admin",
          action: "recipe.delete",
          targetType: "recipe",
          targetId: recipeId,
          targetLabel: deleted.rows[0].title,
          detail: `slug: ${deleted.rows[0].slug}`,
        });
      }
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/admin/recipes" },
    });
  },
});

export default page(function AdminRecipesPage(
  { data: { recipes, q, currentPage, totalCount }, url },
) {
  return (
    <div>
      <PageHeader
        title="Recipes"
        query={q}
        searchPlaceholder="Search recipes..."
      />
      <AdminNav currentPath={url.pathname} />

      <p class="text-sm text-stone-500 mb-3">
        {totalCount}{" "}
        total, private ones included. Deleting here is for moderation; it can't
        be undone.
      </p>
      {recipes.length === 0
        ? (
          <EmptyState title={q ? `No recipes match "${q}"` : "No recipes yet"}>
            Every recipe on the platform shows up in this list, including ones
            marked private.
          </EmptyState>
        )
        : (
          <div class="space-y-2">
            {recipes.map((r) => (
              <div key={r.id} class="card flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <a href={`/recipes/${r.slug}`} class="font-medium link">
                      {r.title}
                    </a>
                    {r.private && (
                      <span class="text-xs bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5">
                        private
                      </span>
                    )}
                  </div>
                  <div class="text-sm text-stone-500 truncate">
                    {r.household_id
                      ? (
                        <a
                          href={`/admin/households/${r.household_id}`}
                          class="link"
                        >
                          {r.household}
                        </a>
                      )
                      : "no household"} ·{" "}
                    {new Date(r.created_at).toISOString().slice(0, 10)}
                  </div>
                </div>
                <form method="POST">
                  <input type="hidden" name="_method" value="DELETE" />
                  <input type="hidden" name="recipe_id" value={r.id} />
                  <ConfirmButton
                    message={`Permanently delete "${r.title}"?`}
                    variant="danger-outline"
                    size="xs"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            ))}
          </div>
        )}
      <Pagination currentPage={currentPage} totalCount={totalCount} url={url} />
    </div>
  );
});
