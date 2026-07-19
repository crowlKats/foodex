import { define } from "../../utils.ts";
import { page } from "fresh";
import { createSession, listSessions } from "../../lib/agent/session.ts";
import { BackLink } from "../../components/BackLink.tsx";
import { Button } from "../../components/Button.tsx";
import DeleteChatButton from "../../islands/DeleteChatButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/auth/login" },
      });
    }
    const sessions = await listSessions(ctx.state.db.query, ctx.state.user.id);
    ctx.state.pageTitle = "Assistant";
    return page({ sessions });
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

export default define.page<typeof handler>(function AgentIndex({ data }) {
  const { sessions } = data;
  return (
    <div>
      <BackLink href="/recipes" label="Back to Recipes" />
      <div class="flex items-center justify-between mt-4 mb-6">
        <h1 class="text-2xl font-bold">Recipe Assistant</h1>
        <form method="POST">
          <Button type="submit">New chat</Button>
        </form>
      </div>

      {sessions.length === 0
        ? (
          <p class="text-stone-500">
            No conversations yet. Start a new chat to plan, create, or improve
            recipes with the assistant.
          </p>
        )
        : (
          <ul class="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} class="flex items-center gap-2">
                <a
                  href={`/agent/${s.id}`}
                  class="card flex-1 hover:border-orange-400"
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
    </div>
  );
});
