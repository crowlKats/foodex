import { handler, page } from "./$mcp.ts";
import {
  docMuted,
  DocNote,
  docProse,
  DocSection,
  DocsPage,
  DocSub,
} from "../../components/DocsPage.tsx";
import { MCP_TOOLS } from "../../lib/mcp.ts";

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = "AI assistants (MCP)";
    return { data: {} };
  },
});

export default page(function McpDocs({ url }) {
  const endpoint = `${url.origin}/mcp`;
  const codeClass =
    "block text-xs font-mono whitespace-pre overflow-x-auto p-3 mb-3 " +
    "bg-stone-100 dark:bg-stone-800";

  return (
    <DocsPage
      currentPath={url.pathname}
      title="AI assistants (MCP)"
      intro="Give an assistant outside Foodex, such as Claude Code, a way to look up your recipes, check the pantry and plan meals for you."
    >
      <DocSection id="what" title="What it is">
        <p class={`${docProse} mb-3`}>
          Foodex speaks the <strong>Model Context Protocol</strong>{" "}
          (MCP), the way AI assistants plug into outside tools. Connect it and
          the assistant can answer "what can I cook tonight?" from your real
          pantry, add a recipe's missing items to the shopping list, or put a
          meal on the plan, all in your household's data.
        </p>
        <p class={`${docMuted} mb-0`}>
          This is separate from the assistant inside Foodex, which imports and
          edits recipes with you reviewing every change. Over MCP an assistant
          reads and adds; it does not write recipes.
        </p>
      </DocSection>

      <DocSection id="connect" title="Connecting">
        <DocSub title="1. Create a token">
          <p class={`${docProse} mb-3`}>
            On your <a href="/profile" class="link">Profile</a> page, under{" "}
            <strong>API tokens</strong>, name the token after what will use it
            and press{" "}
            <strong>Create token</strong>. Copy it right away: it is shown once
            and never again. Treat it like a password; anyone holding it acts as
            you in your household.
          </p>
        </DocSub>
        <DocSub title="2. Point the assistant at Foodex">
          <p class={`${docProse} mb-3`}>
            The endpoint is{" "}
            <code class="text-sm">{endpoint}</code>. Any MCP client that
            supports remote servers with a custom header can use it. For Claude
            Code:
          </p>
          <code class={codeClass}>
            {`claude mcp add --transport http foodex ${endpoint} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`}
          </code>
          <p class={`${docProse} mb-3`}>
            In a JSON-style client config the same server looks like this:
          </p>
          <code class={codeClass}>
            {JSON.stringify(
              {
                mcpServers: {
                  foodex: {
                    type: "http",
                    url: endpoint,
                    headers: { Authorization: "Bearer YOUR_TOKEN" },
                  },
                },
              },
              null,
              2,
            )}
          </code>
          <p class={`${docMuted} mb-0`}>
            Clients that only sign in through OAuth cannot use a token; the
            connection needs a client that lets you set a header.
          </p>
        </DocSub>
        <DocSub title="3. Revoke when done">
          <p class={`${docProse} mb-0`}>
            Each token on your profile shows when it was created and last used.
            {" "}
            <strong>Revoke</strong>{" "}
            cuts it off at once; the assistant simply stops being able to reach
            Foodex. Leaving your household does the same for every token you
            hold, since a token only ever acts within your current household.
          </p>
        </DocSub>
      </DocSection>

      <DocSection id="tools" title="What the assistant can do">
        <p class={`${docProse} mb-3`}>
          These are the tools Foodex offers over MCP. Reads are harmless; the
          last five change your household's data straight away, so a
          well-behaved assistant asks before using them.
        </p>
        <ul class="list-disc pl-5 mb-3">
          {MCP_TOOLS.map((t) => (
            <li key={t.name} class={`${docProse} mb-1`}>
              <code class="text-sm">{t.name}</code>
              <span class={docMuted}>
                {" "}
                {firstSentence(t.description)}
              </span>
            </li>
          ))}
        </ul>
        <DocNote title="Recipes stay in the app">
          Recipes are not created or edited over MCP. That needs the review step
          the in-app assistant gives you, so ask there when you want a recipe
          imported, improved or fixed.
        </DocNote>
      </DocSection>
    </DocsPage>
  );
});

/** The opening sentence of a tool description, as a one-line summary. */
function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text);
  return (m ? m[1] : text).replace(/`/g, "");
}
