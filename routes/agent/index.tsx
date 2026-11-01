import { handler, page } from "./$index.ts";
import { escapeLike } from "../../utils.ts";
import type { AgentSession } from "../../db/types.ts";
import { createSession } from "../../lib/agent/session.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { Button } from "../../components/Button.tsx";
import {
  getPage,
  Pagination,
  paginationParams,
} from "../../components/Pagination.tsx";
import DeleteChatButton from "../../islands/DeleteChatButton.tsx";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import en from "./index.en.mfr";
import it from "./index.it.mfr";

const t = createT({ en, it });

export const handlers = handler({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }

    const q = ctx.url.searchParams.get("q")?.trim() || "";
    const currentPage = getPage(ctx.url);
    const { limit, offset } = paginationParams(currentPage);

    const wheres = ["user_id = $1"];
    const params: unknown[] = [ctx.state.user.id];
    if (q) {
      params.push(escapeLike(q));
      wheres.push(`title ILIKE '%' || $${params.length} || '%' ESCAPE '\\'`);
    }
    const whereSql = wheres.join(" AND ");

    const [result, countRes] = await Promise.all([
      ctx.state.db.query<AgentSession>(
        `SELECT * FROM agent_sessions WHERE ${whereSql}
         ORDER BY updated_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      ctx.state.db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM agent_sessions WHERE ${whereSql}`,
        params,
      ),
    ]);

    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "agent.title",
    ).format();
    return {
      data: {
        sessions: result.rows,
        q,
        currentPage,
        totalCount: Number(countRes.rows[0].cnt),
      },
    };
  },

  async POST(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }
    const s = await createSession(
      ctx.state.db.query,
      ctx.state.user.id,
      ctx.state.householdId,
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/agent/${s.id}` },
    });
  },
});

export default page(function AgentIndex(
  { data: { sessions, q, currentPage, totalCount }, url },
) {
  const trans = t.use();
  return (
    <div>
      <PageHeader
        title={trans("agent.title")}
        query={q}
        searchPlaceholder="Search conversations..."
      >
        <form method="POST">
          <Button type="submit">New chat</Button>
        </form>
      </PageHeader>

      {sessions.length === 0
        ? q
          ? (
            <EmptyState
              title={trans("empty.noConversationsMatch", { query: q })}
            >
              Nothing here goes by that name.
            </EmptyState>
          )
          : (
            <EmptyState
              title={trans("empty.noConversations")}
              action={
                <form method="POST">
                  <Button type="submit" size="sm">New chat</Button>
                </form>
              }
            >
              The assistant finds, imports, and improves recipes with you. Every
              change is staged for your review before it touches the library.
            </EmptyState>
          )
        : (
          <ul class="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} class="flex items-center gap-2">
                <a
                  href={`/agent/${s.id}`}
                  class="card card-hover flex-1"
                >
                  <span class="font-medium">{s.title}</span>
                  <span class="block text-xs text-stone-500">
                    {new Date(s.updated_at).toLocaleString()}
                  </span>
                </a>
                <DeleteChatButton sessionId={s.id} />
              </li>
            ))}
          </ul>
        )}
      <Pagination currentPage={currentPage} totalCount={totalCount} url={url} />
    </div>
  );
});
