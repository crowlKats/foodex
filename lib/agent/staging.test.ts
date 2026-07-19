import { assert, assertEquals } from "@std/assert";
import type { AgentEvent } from "./events.ts";
import {
  agentProposal,
  effective,
  foldStaging,
  isUserEdited,
  pendingItems,
} from "./staging.ts";

// Minimal event constructors (seq assigned positionally).
function log(...bodies: Omit<AgentEvent, "seq">[]): AgentEvent[] {
  return bodies.map((b, i) => ({ ...b, seq: i + 1 } as AgentEvent));
}

Deno.test("foldStaging: create_recipe → user_edit → revert", () => {
  const events = log(
    {
      type: "tool_result",
      payload: {
        tool_use_id: "t1",
        tool_name: "create_recipe",
        is_error: false,
        content: { id: "t1" },
        staged: {
          op: "create",
          kind: "create_recipe",
          item_id: "t1",
          full: { title: "Soup", prep_time: 5 },
        },
      },
    },
    {
      type: "user_edit",
      payload: {
        item_id: "t1",
        ops: [{ op: "set", path: "title", value: "Tomato Soup" }],
      },
    },
  );

  let map = foldStaging(events);
  let it = map.get("t1")!;
  assertEquals(effective(it).title, "Tomato Soup");
  assertEquals(agentProposal(it).title, "Soup");
  assert(isUserEdited(it));
  assertEquals(it.last_seq, 2);

  // Revert restores the agent's proposal.
  map = foldStaging([
    ...events,
    { type: "user_revert", payload: { item_id: "t1" }, seq: 3 } as AgentEvent,
  ]);
  it = map.get("t1")!;
  assertEquals(effective(it).title, "Soup");
  assert(!isUserEdited(it));
  assertEquals(it.last_seq, 3);
});

Deno.test("foldStaging: modify seed + update accumulate ops; last_seq is version", () => {
  const events = log(
    {
      type: "tool_result",
      payload: {
        tool_use_id: "m1",
        tool_name: "edit_recipe",
        is_error: false,
        content: {},
        staged: {
          op: "seed",
          kind: "edit_recipe",
          item_id: "m1",
          target: { slug: "pancakes", recipe_id: "r1" },
          base_version: "2026-01-01T00:00:00Z",
          base_data: { title: "Pancakes", prep_time: 10 },
          ops: [{ op: "set", path: "prep_time", value: 15 }],
        },
      },
    },
    {
      type: "tool_result",
      payload: {
        tool_use_id: "u1",
        tool_name: "edit_proposed",
        is_error: false,
        content: {},
        staged: {
          op: "update",
          item_id: "m1",
          ops: [{ op: "set", path: "title", value: "Fluffy Pancakes" }],
        },
      },
    },
  );

  const it = foldStaging(events).get("m1")!;
  assertEquals(effective(it), { title: "Fluffy Pancakes", prep_time: 15 });
  assertEquals(it.base_version, "2026-01-01T00:00:00Z");
  assertEquals(it.last_seq, 2); // version = seq of last mutation
  assert(!isUserEdited(it)); // both writes were the agent's
});

Deno.test("foldStaging: user_edit on modify item does not move revert target", () => {
  const events = log(
    {
      type: "tool_result",
      payload: {
        tool_use_id: "m1",
        tool_name: "edit_recipe",
        is_error: false,
        content: {},
        staged: {
          op: "seed",
          kind: "edit_recipe",
          item_id: "m1",
          target: { slug: "x", recipe_id: "r1" },
          base_version: "v1",
          base_data: { title: "X", prep_time: 10 },
          ops: [{ op: "set", path: "prep_time", value: 15 }],
        },
      },
    },
    {
      type: "user_edit",
      payload: {
        item_id: "m1",
        ops: [{ op: "set", path: "prep_time", value: 99 }],
      },
    },
  );
  const it = foldStaging(events).get("m1")!;
  assertEquals(effective(it).prep_time, 99);
  assertEquals(agentProposal(it).prep_time, 15);
  assert(isUserEdited(it));
});

Deno.test("foldStaging: discard and apply remove from pending", () => {
  const base: Omit<AgentEvent, "seq">[] = [
    {
      type: "tool_result",
      payload: {
        tool_use_id: "a",
        tool_name: "create_recipe",
        is_error: false,
        content: {},
        staged: {
          op: "create",
          kind: "create_recipe",
          item_id: "a",
          full: { title: "A" },
        },
      },
    },
    {
      type: "tool_result",
      payload: {
        tool_use_id: "b",
        tool_name: "create_recipe",
        is_error: false,
        content: {},
        staged: {
          op: "create",
          kind: "create_recipe",
          item_id: "b",
          full: { title: "B" },
        },
      },
    },
  ];
  const events = log(
    ...base,
    { type: "user_discard", payload: { item_id: "a" } },
    {
      type: "apply",
      payload: {
        item_id: "b",
        result: { kind: "recipe", recipe_id: "r9", slug: "b" },
      },
    },
  );
  const map = foldStaging(events);
  assertEquals(map.get("a")!.status, "discarded");
  assertEquals(map.get("b")!.status, "applied");
  assertEquals(pendingItems(map).length, 0);
});
