import { assert, assertEquals } from "@std/assert";
import type { AgentEvent } from "./events.ts";
import { stepDisplayNumber } from "./merge.ts";
import {
  agentProposal,
  effective,
  foldStaging,
  isUserEdited,
  pendingItems,
  serializePending,
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

Deno.test("foldStaging: user_staged creates a pending item like a tool create", () => {
  const events = log(
    {
      type: "user_staged",
      payload: {
        mutation: {
          op: "create",
          kind: "create_recipe",
          item_id: "d1",
          full: { title: "Migrated Draft", ingredients: [], steps: [] },
        },
      },
    },
    {
      type: "user_edit",
      payload: {
        item_id: "d1",
        ops: [{ op: "set", path: "title", value: "Renamed" }],
      },
    },
  );
  const map = foldStaging(events);
  const it = map.get("d1")!;
  assertEquals(it.status, "pending");
  assertEquals(it.kind, "create_recipe");
  assertEquals(effective(it).title, "Renamed");
  assertEquals(agentProposal(it).title, "Migrated Draft");
  assertEquals(pendingItems(map).length, 1);
});

Deno.test("foldStaging: editing steps 6–8 keeps their positions in the full recipe", () => {
  const steps = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i + 1}`,
    title: `Step ${i + 1}`,
    body: `Body ${i + 1}`,
  }));
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
          target: { slug: "long", recipe_id: "r1" },
          base_version: "v1",
          base_data: { title: "Long", steps },
          ops: [
            {
              op: "set",
              collection: "steps",
              key: "s6",
              field: "body",
              value: "Edited 6",
            },
            {
              op: "set",
              collection: "steps",
              key: "s7",
              field: "body",
              value: "Edited 7",
            },
            {
              op: "set",
              collection: "steps",
              key: "s8",
              field: "body",
              value: "Edited 8",
            },
          ],
        },
      },
    },
  );

  const it = foldStaging(events).get("m1")!;
  const effSteps = (effective(it).steps as { id: string; body: string }[]);
  assertEquals(effSteps.map((s) => s.id), steps.map((s) => s.id));
  assertEquals(effSteps[5].body, "Edited 6");
  assertEquals(effSteps[6].body, "Edited 7");
  assertEquals(effSteps[7].body, "Edited 8");
  assertEquals(stepDisplayNumber("s6", effSteps, steps), 6);
  assertEquals(stepDisplayNumber("s7", effSteps, steps), 7);
  assertEquals(stepDisplayNumber("s8", effSteps, steps), 8);

  const serialized = serializePending(foldStaging(events))[0];
  const shown = (serialized.effective.steps as { id: string }[]);
  assertEquals(shown.map((s) => s.id), steps.map((s) => s.id));
});

Deno.test("foldStaging: a scalar set of steps 6–8 does not collapse them to 1–3", () => {
  const steps = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i + 1}`,
    title: `Step ${i + 1}`,
    body: `Body ${i + 1}`,
  }));
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
          target: { slug: "long", recipe_id: "r1" },
          base_version: "v1",
          base_data: { title: "Long", steps },
          ops: [{
            op: "set",
            path: "steps",
            value: [
              { id: "s6", title: "Step 6", body: "Edited 6" },
              { id: "s7", title: "Step 7", body: "Edited 7" },
              { id: "s8", title: "Step 8", body: "Edited 8" },
            ],
          }],
        },
      },
    },
  );

  const it = foldStaging(events).get("m1")!;
  const effSteps = (effective(it).steps as { id: string; body: string }[]);
  assertEquals(effSteps.length, 8);
  assertEquals(effSteps.map((s) => s.id), steps.map((s) => s.id));
  assertEquals(
    ["s6", "s7", "s8"].map((id) => stepDisplayNumber(id, effSteps, steps)),
    [6, 7, 8],
  );
});
