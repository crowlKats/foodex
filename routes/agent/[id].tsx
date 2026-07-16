import { HttpError, page } from "fresh";
import { define } from "../../utils.ts";
import { getSession, loadEvents } from "../../lib/agent/session.ts";
import { foldConversation } from "../../lib/agent/conversation.ts";
import { foldStaging, serializePending } from "../../lib/agent/staging.ts";
import { isTurnActive } from "../../lib/agent/lock.ts";
import { BackLink } from "../../components/BackLink.tsx";
import AgentSession from "../../islands/AgentSession.tsx";
import DeleteChatButton from "../../islands/DeleteChatButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }
    const session = await getSession(ctx.state.db.query, ctx.params.id);
    if (!session || session.user_id !== ctx.state.user.id) {
      throw new HttpError(404);
    }
    const events = await loadEvents(
      ctx.state.db.query,
      session.id,
      session.head_seq,
    );
    const [ingredientsRes, toolsRes, recipesRes] = await Promise.all([
      ctx.state.db.query<{ id: string; name: string; unit: string | null }>(
        "SELECT id, name, unit FROM ingredients ORDER BY name",
      ),
      ctx.state.db.query<{ id: string; name: string }>(
        "SELECT id, name FROM tools ORDER BY name",
      ),
      ctx.state.db.query<{ id: string; title: string }>(
        "SELECT id, title FROM recipes WHERE household_id = $1 ORDER BY title",
        [session.household_id],
      ),
    ]);
    ctx.state.pageTitle = session.title;
    return page({
      sessionId: session.id,
      title: session.title,
      timeline: foldConversation(events).timeline,
      staging: serializePending(foldStaging(events)),
      turnActive: isTurnActive(session.id),
      ingredients: ingredientsRes.rows.map((g) => ({
        id: g.id,
        name: g.name,
        unit: g.unit ?? "",
      })),
      allTools: toolsRes.rows,
      allRecipes: recipesRes.rows,
    });
  },
});

export default define.page<typeof handler>(function AgentSessionPage({ data }) {
  return (
    <div class="h-full flex flex-col">
      <div class="shrink-0 flex items-center gap-3 px-4 py-2 border-b-2 border-stone-200 dark:border-stone-700">
        <BackLink href="/agent" label="Conversations" />
        <h1 id="agent-chat-title" class="font-bold truncate flex-1 min-w-0">
          {data.title}
        </h1>
        <DeleteChatButton sessionId={data.sessionId} redirect="/agent" />
      </div>
      <div class="flex-1 min-h-0">
        <AgentSession
          sessionId={data.sessionId}
          initialTimeline={data.timeline}
          initialStaging={data.staging}
          initialTurnActive={data.turnActive}
          ingredients={data.ingredients}
          allTools={data.allTools}
          allRecipes={data.allRecipes}
        />
      </div>
    </div>
  );
});
