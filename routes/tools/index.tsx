import { handler, page } from "./$index.ts";
import { escapeLike } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input, InputMultiline } from "../../components/Input.tsx";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";
import type { Tool } from "../../db/types.ts";

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    let result, countRes;
    if (q) {
      const escaped = escapeLike(q);
      [result, countRes] = await Promise.all([
        ctx.state.db.query<Tool>(
          `SELECT * FROM tools
           WHERE name ILIKE '%' || $1 || '%' ESCAPE '\\' OR description ILIKE '%' || $1 || '%' ESCAPE '\\'
           ORDER BY name LIMIT $2 OFFSET $3`,
          [escaped, limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM tools
           WHERE name ILIKE '%' || $1 || '%' ESCAPE '\\' OR description ILIKE '%' || $1 || '%' ESCAPE '\\'`,
          [escaped],
        ),
      ]);
    } else {
      [result, countRes] = await Promise.all([
        ctx.state.db.query<Tool>(
          "SELECT * FROM tools ORDER BY name LIMIT $1 OFFSET $2",
          [limit, offset],
        ),
        ctx.state.db.query<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM tools",
        ),
      ]);
    }
    const totalCount = Number(countRes.rows[0].cnt);

    const ownedToolIds = new Set<string>();
    if (ctx.state.householdId) {
      const htRes = await ctx.state.db.query<{ tool_id: string }>(
        "SELECT tool_id FROM household_tools WHERE household_id = $1",
        [ctx.state.householdId],
      );
      for (const row of htRes.rows) {
        ownedToolIds.add(row.tool_id);
      }
    }

    const error = ctx.url.searchParams.get("error") || undefined;
    ctx.state.pageTitle = "Tools";
    return {
      data: {
        tools: result.rows,
        q,
        ownedToolIds: [...ownedToolIds],
        currentPage,
        totalCount,
        error,
        loggedIn: ctx.state.user != null,
      },
    };
  },
  async POST(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const form = await ctx.req.formData();
    const name = form.get("name") as string;
    const description = form.get("description") as string;
    if (!name?.trim()) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/tools?error=Name+is+required" },
      });
    }
    const toolRes = await ctx.state.db.query<{ id: string }>(
      "INSERT INTO tools (name, description) VALUES ($1, $2) RETURNING id",
      [name.trim(), description?.trim() || null],
    );

    // Auto-add to household
    if (ctx.state.householdId) {
      await ctx.state.db.query(
        "INSERT INTO household_tools (household_id, tool_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [ctx.state.householdId, toolRes.rows[0].id],
      );
    }

    return new Response(null, {
      status: 303,
      headers: { Location: `/tools/${toolRes.rows[0].id}` },
    });
  },
});

export default page(
  function ToolsPage(
    {
      data: {
        tools,
        error,
        q,
        ownedToolIds,
        currentPage,
        totalCount,
        loggedIn,
      },
      url,
    },
  ) {
    const ownedSet = new Set(ownedToolIds ?? []);
    return (
      <div>
        <PageHeader title="Tools" query={q} />

        {error && (
          <div class="alert-error mb-4">
            {error}
          </div>
        )}

        <div class={`grid gap-6 ${loggedIn ? "md:grid-cols-2" : ""}`}>
          {loggedIn && (
            <div>
              <h2 class="text-lg font-semibold mb-3">Add Tool</h2>
              <form
                method="POST"
                class="card space-y-3"
              >
                <FormField label="Name">
                  <Input
                    type="text"
                    name="name"
                    required
                    class="w-full"
                  />
                </FormField>
                <FormField label="Description">
                  <InputMultiline
                    name="description"
                    rows={3}
                    class="w-full"
                  />
                </FormField>
                <Button type="submit">
                  Add Tool
                </Button>
              </form>
            </div>
          )}

          <div>
            <h2 class="text-lg font-semibold mb-3">
              All Tools ({totalCount})
            </h2>
            {tools.length === 0
              ? q
                ? (
                  <EmptyState title={`No tools match "${q}"`}>
                    Nothing here goes by that name.
                  </EmptyState>
                )
                : (
                  <EmptyState title="No tools yet">
                    Tools are your cookware — a pan, a stand mixer, an oven. A
                    recipe can reference one along with the settings it needs
                    ("180 °C", "medium-low") and a note on how it's used, so the
                    method doesn't have to spell it out every time. {loggedIn
                      ? "Add your first with the form on this page."
                      : "Sign in to add one."}
                  </EmptyState>
                )
              : (
                <div class="space-y-2">
                  {tools.map((m) => (
                    <a
                      key={m.id}
                      href={`/tools/${m.id}`}
                      class="block card card-hover"
                    >
                      <div class="flex items-center gap-2">
                        <div class="font-medium flex-1">{m.name}</div>
                        {ownedSet.has(m.id) && (
                          <span class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded">
                            owned
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <div class="text-sm text-stone-500 truncate">
                          {m.description}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            <Pagination
              currentPage={currentPage}
              totalCount={totalCount}
              url={url}
            />
          </div>
        </div>
      </div>
    );
  },
);
