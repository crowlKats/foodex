import { assertEquals } from "@std/assert";
import {
  handleMcpBody,
  INVALID_PARAMS,
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_NAMES,
  type McpToolCaller,
  METHOD_NOT_FOUND,
} from "./mcp.ts";

const calls: { name: string; input: unknown }[] = [];
const fakeCall: McpToolCaller = (name, input) => {
  calls.push({ name, input });
  if (name === "get_recipe") {
    return Promise.resolve({
      content: { error: "not found" },
      is_error: true,
    });
  }
  return Promise.resolve({
    content: { recipes: [{ slug: "soup" }] },
    is_error: false,
  });
};

function req(method: string, params?: unknown, id: number | string = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

Deno.test("initialize echoes a supported version and falls back otherwise", async () => {
  const a = await handleMcpBody(
    req("initialize", { protocolVersion: "2025-03-26" }),
    fakeCall,
  );
  assertEquals(a.status, 200);
  const ra = a.body as { result: { protocolVersion: string } };
  assertEquals(ra.result.protocolVersion, "2025-03-26");

  const b = await handleMcpBody(
    req("initialize", { protocolVersion: "1999-01-01" }),
    fakeCall,
  );
  const rb = b.body as { result: { protocolVersion: string } };
  assertEquals(rb.result.protocolVersion, MCP_PROTOCOL_VERSION);
});

Deno.test("notifications get no body", async () => {
  const out = await handleMcpBody(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    fakeCall,
  );
  assertEquals(out, { status: 202, body: null });
});

Deno.test("tools/list exposes exactly the MCP subset", async () => {
  const out = await handleMcpBody(req("tools/list"), fakeCall);
  const body = out.body as {
    result: { tools: { name: string; inputSchema: unknown }[] };
  };
  assertEquals(
    body.result.tools.map((t) => t.name),
    [...MCP_TOOL_NAMES],
  );
  for (const t of body.result.tools) {
    assertEquals(typeof t.inputSchema, "object");
  }
});

Deno.test("tools/call forwards arguments and wraps the result", async () => {
  calls.length = 0;
  const out = await handleMcpBody(
    req("tools/call", { name: "list_recipes", arguments: { search: "soup" } }),
    fakeCall,
  );
  assertEquals(calls, [{ name: "list_recipes", input: { search: "soup" } }]);
  const body = out.body as {
    result: {
      content: { type: string; text: string }[];
      structuredContent?: unknown;
      isError: boolean;
    };
  };
  assertEquals(body.result.isError, false);
  assertEquals(body.result.structuredContent, { recipes: [{ slug: "soup" }] });
  assertEquals(
    JSON.parse(body.result.content[0].text),
    { recipes: [{ slug: "soup" }] },
  );
});

Deno.test("a failed tool is an error result, not a protocol error", async () => {
  const out = await handleMcpBody(
    req("tools/call", { name: "get_recipe", arguments: { slug: "x" } }),
    fakeCall,
  );
  const body = out.body as {
    error?: unknown;
    result: { isError: boolean; structuredContent?: unknown };
  };
  assertEquals(body.error, undefined);
  assertEquals(body.result.isError, true);
  assertEquals(body.result.structuredContent, undefined);
});

Deno.test("tools outside the subset and unknown methods are rejected", async () => {
  calls.length = 0;
  const a = await handleMcpBody(
    req("tools/call", { name: "edit_recipe", arguments: {} }),
    fakeCall,
  );
  assertEquals(
    (a.body as { error: { code: number } }).error.code,
    INVALID_PARAMS,
  );
  assertEquals(calls, []);

  const b = await handleMcpBody(req("resources/list"), fakeCall);
  assertEquals(
    (b.body as { error: { code: number } }).error.code,
    METHOD_NOT_FOUND,
  );
});

Deno.test("a batch answers each request in order and skips notifications", async () => {
  const out = await handleMcpBody(
    [
      req("ping", undefined, "a"),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      req("ping", undefined, "b"),
    ],
    fakeCall,
  );
  assertEquals(out.status, 200);
  assertEquals(
    (out.body as { id: string }[]).map((r) => r.id),
    ["a", "b"],
  );
});

Deno.test("garbage is an invalid request", async () => {
  const out = await handleMcpBody({ hello: "world" }, fakeCall);
  assertEquals(out.status, 200);
  assertEquals((out.body as { error: { code: number } }).error.code, -32600);
});
