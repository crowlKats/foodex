import { handler, page } from "./$index.ts";
import { escapeLike } from "../../utils.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { FormField } from "../../components/FormField.tsx";
import { Button } from "../../components/Button.tsx";
import { Input, InputMultiline } from "../../components/Input.tsx";
import { logAudit } from "../../lib/audit.ts";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";
import type { Tool } from "../../db/types.ts";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./index.en.mfr";
import it from "./index.it.mfr";

const t = createT({ en, it });

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
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "catalog.tools",
    ).format();
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

    await logAudit(ctx.state.db.query, ctx.state.user, {
      action: "tool.create",
      targetType: "tool",
      targetId: toolRes.rows[0].id,
      targetLabel: name.trim(),
      householdId: ctx.state.householdId,
    });

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
    const trans = t.use();
    const sharedTrans = shared.use();
    const ownedSet = new Set(ownedToolIds ?? []);
    return (
      <div>
        <PageHeader title={trans("catalog.tools")} query={q} />

        {error && (
          <div class="alert-error mb-4">
            {error}
          </div>
        )}

        <div class={`grid gap-6 ${loggedIn ? "md:grid-cols-2" : ""}`}>
          {loggedIn && (
            <div>
              <h2 class="text-lg font-semibold mb-3">{t("catalog.addTool")}</h2>
              <form
                method="POST"
                class="card space-y-3"
              >
                <FormField label={sharedTrans("common.name")}>
                  <Input
                    type="text"
                    name="name"
                    required
                    class="w-full"
                  />
                </FormField>
                <FormField label={sharedTrans("form.description")}>
                  <InputMultiline
                    name="description"
                    rows={3}
                    class="w-full"
                  />
                </FormField>
                <Button type="submit">
                  {t("catalog.addTool")}
                </Button>
              </form>
            </div>
          )}

          <div>
            <h2 class="text-lg font-semibold mb-3">
              {shared("common.allCount", {
                title: trans("catalog.tools"),
                count: String(totalCount),
              })}
            </h2>
            {tools.length === 0
              ? q
                ? (
                  <EmptyState title={trans("empty.noToolsMatch", { query: q })}>
                    {shared("error.noMatchQuery")}
                  </EmptyState>
                )
                : (
                  <EmptyState title={trans("empty.noTools")}>
                    {t("empty.noToolsBody")} {loggedIn
                      ? shared("empty.addFirstForm")
                      : shared("empty.signInToAdd")}
                  </EmptyState>
                )
              : (
                <div class="space-y-2">
                  {tools.map((tool) => (
                    <a
                      key={tool.id}
                      href={`/tools/${tool.id}`}
                      class="block card card-hover"
                    >
                      <div class="flex items-center gap-2">
                        <div class="font-medium flex-1">{tool.name}</div>
                        {ownedSet.has(tool.id) && (
                          <span class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded">
                            {shared("common.owned")}
                          </span>
                        )}
                      </div>
                      {tool.description && (
                        <div class="text-sm text-stone-500 truncate">
                          {tool.description}
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
