import { assert, assertEquals } from "@std/assert";
import type { AgentEvent } from "./events.ts";
import { foldConversation } from "./conversation.ts";

function log(...bodies: Omit<AgentEvent, "seq">[]): AgentEvent[] {
  return bodies.map((b, i) => ({ ...b, seq: i + 1 } as AgentEvent));
}

Deno.test("foldConversation: tool_use turn pairs assistant + tool_result user message", () => {
  const events = log(
    { type: "user_message", payload: { text: "list recipes" } },
    {
      type: "assistant_message",
      payload: {
        content: [
          { type: "tool_use", id: "tu1", name: "list_recipes", input: {} },
        ] as never,
        usage: { input_tokens: 1, output_tokens: 1, model: "m" },
      },
    },
    {
      type: "tool_result",
      payload: {
        tool_use_id: "tu1",
        tool_name: "list_recipes",
        is_error: false,
        content: [{ slug: "soup" }],
      },
    },
    {
      type: "assistant_message",
      payload: {
        content: [{ type: "text", text: "You have 1 recipe." }] as never,
        usage: { input_tokens: 1, output_tokens: 1, model: "m" },
      },
    },
  );

  const { apiMessages } = foldConversation(events);
  assertEquals(apiMessages.map((m) => m.role), [
    "user",
    "assistant",
    "user", // tool_result block
    "assistant",
  ]);
  const toolMsg = apiMessages[2];
  assert(Array.isArray(toolMsg.content));
  assertEquals((toolMsg.content as { type: string }[])[0].type, "tool_result");
});

Deno.test("foldConversation: user edits collapse into a notice on the next user turn", () => {
  const events = log(
    // agent stages a recipe
    {
      type: "tool_result",
      payload: {
        tool_use_id: "c1",
        tool_name: "create_recipe",
        is_error: false,
        content: {},
        staged: {
          op: "create",
          kind: "create_recipe",
          item_id: "c1",
          full: { title: "Soup" },
        },
      },
    },
    // user manually renames it
    {
      type: "user_edit",
      payload: {
        item_id: "c1",
        ops: [{ op: "set", path: "title", value: "Miso Soup" }],
      },
    },
    // user sends another message
    { type: "user_message", payload: { text: "make it vegan" } },
  );

  const { apiMessages, timeline } = foldConversation(events);
  const last = apiMessages[apiMessages.length - 1];
  assertEquals(last.role, "user");
  const blocks = last.content as { type: string; text: string }[];
  // notice block precedes the user's actual text
  assert(blocks[0].text.includes("Miso Soup"));
  assert(blocks[0].text.includes("staging area"));
  assertEquals(blocks[1].text, "make it vegan");
  // notice also surfaced in the display timeline
  assert(
    timeline.some((t) => t.kind === "notice" && t.text.includes("Miso Soup")),
  );
});

Deno.test("foldConversation: edits with no following turn produce no notice", () => {
  const events = log(
    { type: "user_message", payload: { text: "hi" } },
    {
      type: "assistant_message",
      payload: {
        content: [{ type: "text", text: "hello" }] as never,
        usage: { input_tokens: 1, output_tokens: 1, model: "m" },
      },
    },
    {
      type: "tool_result",
      payload: {
        tool_use_id: "c1",
        tool_name: "create_recipe",
        is_error: false,
        content: {},
        staged: {
          op: "create",
          kind: "create_recipe",
          item_id: "c1",
          full: { title: "Soup" },
        },
      },
    },
    {
      type: "user_edit",
      payload: {
        item_id: "c1",
        ops: [{ op: "set", path: "title", value: "X" }],
      },
    },
  );
  const { apiMessages, timeline } = foldConversation(events);
  // The edit is pending for the *next* turn; nothing surfaces it yet.
  const text = JSON.stringify(apiMessages);
  assert(!text.includes("staging area"));
  assert(!timeline.some((t) => t.kind === "notice"));
});
