import { assert, assertEquals } from "@std/assert";
import type { QueryFn } from "../../db/mod.ts";
import type { AgentEvent } from "./events.ts";
import { executeTool, type ToolCtx } from "./tools.ts";

function log(...bodies: Omit<AgentEvent, "seq">[]): AgentEvent[] {
  return bodies.map((b, i) => ({ ...b, seq: i + 1 } as AgentEvent));
}

const throwingQ: QueryFn = () => {
  throw new Error("query should not be called");
};

// A create tool_result event that stages recipe item "c1".
const createC1: Omit<AgentEvent, "seq"> = {
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
};

Deno.test("edit_proposed: allowed right after create (create counts as a touch)", async () => {
  const ctx: ToolCtx = {
    q: throwingQ,
    householdId: "h",
    events: log(createC1),
  };
  const res = await executeTool(
    "edit_proposed",
    { id: "c1", ops: [{ op: "set", path: "title", value: "Miso" }] },
    "u1",
    ctx,
  );
  assertEquals(res.is_error, false);
  assertEquals(res.staged?.op, "update");
  // create-kind items resolve ops into a full replacement
  assert(res.staged && "full" in res.staged);
});

Deno.test("edit_proposed: rejected when user edited it since the agent last saw it", async () => {
  const events = log(
    createC1,
    {
      type: "user_edit",
      payload: {
        item_id: "c1",
        ops: [{ op: "set", path: "title", value: "X" }],
      },
    },
  );
  const res = await executeTool(
    "edit_proposed",
    { id: "c1", ops: [{ op: "set", path: "title", value: "Y" }] },
    "u1",
    { q: throwingQ, householdId: "h", events },
  );
  assertEquals(res.is_error, true);
  assert(
    String((res.content as { error: string }).error).includes(
      "changed since you read it",
    ),
  );
});

Deno.test("edit_proposed: re-reading with get_proposed clears the stale guard", async () => {
  const events = log(
    createC1,
    {
      type: "user_edit",
      payload: {
        item_id: "c1",
        ops: [{ op: "set", path: "title", value: "X" }],
      },
    },
    // agent re-reads → observation for staged:c1 registers a fresh touch
    {
      type: "tool_result",
      payload: {
        tool_use_id: "g1",
        tool_name: "get_proposed",
        is_error: false,
        content: {},
        observations: [{ target: "staged:c1", version: "2" }],
      },
    },
  );
  const res = await executeTool(
    "edit_proposed",
    { id: "c1", ops: [{ op: "set", path: "title", value: "Y" }] },
    "u2",
    { q: throwingQ, householdId: "h", events },
  );
  assertEquals(res.is_error, false);
});

// ── live recipe guard (needs a stub for the DB reads) ──────────────

function recipeQ(liveVersion: string): QueryFn {
  return ((text: string) => {
    if (/FROM recipes WHERE slug/.test(text)) {
      return Promise.resolve({ rows: [{ id: "r1" }] });
    }
    if (/SELECT \* FROM recipes WHERE id/.test(text)) {
      return Promise.resolve({
        rows: [{
          id: "r1",
          title: "Pancakes",
          updated_at: liveVersion,
          quantity_type: "servings",
          quantity_value: 4,
          quantity_unit: "servings",
        }],
      });
    }
    return Promise.resolve({ rows: [] }); // child collections
  }) as QueryFn;
}

Deno.test("edit_recipe: rejected without a prior get_recipe", async () => {
  const res = await executeTool(
    "edit_recipe",
    { slug: "pancakes", ops: [{ op: "set", path: "prep_time", value: 20 }] },
    "m1",
    { q: recipeQ("v1"), householdId: "h", events: [] },
  );
  assertEquals(res.is_error, true);
  assert(
    String((res.content as { error: string }).error).includes("get_recipe"),
  );
});

Deno.test("edit_recipe: seeds when the observed version matches live", async () => {
  const events = log({
    type: "tool_result",
    payload: {
      tool_use_id: "g1",
      tool_name: "get_recipe",
      is_error: false,
      content: {},
      observations: [{ target: "recipe:r1", version: "v1" }],
    },
  });
  const res = await executeTool(
    "edit_recipe",
    { slug: "pancakes", ops: [{ op: "set", path: "prep_time", value: 20 }] },
    "m1",
    { q: recipeQ("v1"), householdId: "h", events },
  );
  assertEquals(res.is_error, false);
  assertEquals(res.staged?.op, "seed");
  assert(
    res.staged && "base_version" in res.staged &&
      res.staged.base_version === "v1",
  );
});

Deno.test("edit_recipe: rejected when the recipe changed since it was read", async () => {
  const events = log({
    type: "tool_result",
    payload: {
      tool_use_id: "g1",
      tool_name: "get_recipe",
      is_error: false,
      content: {},
      observations: [{ target: "recipe:r1", version: "v0" }],
    },
  });
  const res = await executeTool(
    "edit_recipe",
    { slug: "pancakes", ops: [{ op: "set", path: "prep_time", value: 20 }] },
    "m1",
    { q: recipeQ("v1"), householdId: "h", events }, // live is v1, agent saw v0
  );
  assertEquals(res.is_error, true);
  assert(
    String((res.content as { error: string }).error).includes(
      "changed since you read it",
    ),
  );
});

Deno.test("edit_recipe: Date updated_at matches ISO-string observation", async () => {
  // Regression: node-postgres returns updated_at as a Date on a fresh read but
  // observations round-trip through JSONB as ISO strings. Both must compare equal.
  const when = new Date("2026-03-01T12:00:00Z");
  const q = ((text: string) => {
    if (/FROM recipes WHERE slug/.test(text)) {
      return Promise.resolve({ rows: [{ id: "r1" }] });
    }
    if (/SELECT \* FROM recipes WHERE id/.test(text)) {
      return Promise.resolve({
        rows: [{
          id: "r1",
          title: "Pancakes",
          updated_at: when, // a real Date, as pg returns
          quantity_type: "servings",
          quantity_value: 4,
          quantity_unit: "servings",
        }],
      });
    }
    return Promise.resolve({ rows: [] });
  }) as QueryFn;
  const events = log({
    type: "tool_result",
    payload: {
      tool_use_id: "g1",
      tool_name: "get_recipe",
      is_error: false,
      content: {},
      observations: [{ target: "recipe:r1", version: when.toISOString() }],
    },
  });
  const res = await executeTool(
    "edit_recipe",
    { slug: "pancakes", ops: [] },
    "m1",
    { q, householdId: "h", events },
  );
  assertEquals(res.is_error, false);
  assertEquals(res.staged?.op, "seed");
});
