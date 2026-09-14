// MCP (Model Context Protocol) server, Streamable HTTP transport, stateless.
// Speaks JSON-RPC 2.0 over a single POST endpoint and exposes a subset of
// the assistant's tools (lib/agent/tools.ts) to outside clients such as
// Claude Code. This module is the pure half: it turns a parsed request body
// into a response and knows nothing about HTTP or auth; routes/mcp.tsx
// wraps it.

import { type ToolDef, type ToolExecResult, TOOLS } from "./agent/tools.ts";

/** The newest protocol revision this server speaks. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
/** Revisions a client may ask for and get back unchanged. */
const SUPPORTED_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);

export const SERVER_INFO = { name: "foodex", version: "1.0.0" };

/**
 * Assistant tools offered over MCP: reads and direct actions. Web tools are
 * left out (the client brings its own), and so are the proposal tools:
 * they stage edits into a chat session's event log for the user to review
 * there, which an outside client has no way to show.
 */
export const MCP_TOOL_NAMES = [
  "list_recipes",
  "get_recipe",
  "list_ingredients",
  "get_ingredient",
  "list_tools",
  "create_tool",
  "get_pantry",
  "get_shopping_list",
  "get_plan",
  "suggest_recipes",
  "plan_meal",
  "unplan_meal",
  "add_to_shopping_list",
  "add_pantry_item",
] as const;

export const MCP_TOOLS: ToolDef[] = MCP_TOOL_NAMES.map((name) => {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) throw new Error(`MCP tool ${name} is not an agent tool`);
  return def;
});

export const SERVER_INSTRUCTIONS =
  "Foodex is the user's recipe book, pantry, meal plan and shopping list. " +
  "Recipes, pantry stock and lists belong to the user's household. Read " +
  "tools are free to call; plan_meal, unplan_meal, add_to_shopping_list, " +
  "add_pantry_item and create_tool change the household's data right away, " +
  "so confirm with the user before calling them. Recipes cannot be created " +
  "or edited over MCP; point the user at the in-app assistant for that.";

// ── JSON-RPC ───────────────────────────────────────────────────────

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.jsonrpc === "2.0" && typeof v.method === "string";
}

// ── server ─────────────────────────────────────────────────────────

/** Runs one tool call; the route binds this to the caller's household. */
export type McpToolCaller = (
  name: string,
  input: unknown,
) => Promise<ToolExecResult>;

export interface McpOutcome {
  /** 200 with a body, or 202 for notifications and responses alone. */
  status: 200 | 202 | 400;
  body: JsonRpcResponse | JsonRpcResponse[] | null;
}

/**
 * Handle one POST body: a single message or (older clients) a batch. Each
 * request gets a response; notifications get none. The outcome carries
 * the HTTP status the transport should send.
 */
export async function handleMcpBody(
  body: unknown,
  call: McpToolCaller,
): Promise<McpOutcome> {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return {
        status: 400,
        body: rpcError(null, INVALID_REQUEST, "Empty batch"),
      };
    }
    const responses: JsonRpcResponse[] = [];
    for (const msg of body) {
      const res = await handleMessage(msg, call);
      if (res) responses.push(res);
    }
    return responses.length > 0
      ? { status: 200, body: responses }
      : { status: 202, body: null };
  }
  const res = await handleMessage(body, call);
  return res ? { status: 200, body: res } : { status: 202, body: null };
}

async function handleMessage(
  msg: unknown,
  call: McpToolCaller,
): Promise<JsonRpcResponse | null> {
  if (!isRequest(msg)) {
    // A client's response to a server request: this server sends none, so
    // there is nothing to match it against.
    if (
      typeof msg === "object" && msg !== null &&
      ("result" in msg || "error" in msg)
    ) {
      return null;
    }
    return rpcError(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 request");
  }
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  if (msg.method.startsWith("notifications/")) return null;
  if (isNotification) {
    // A request without an id cannot be answered; drop it.
    return null;
  }
  const params = (msg.params ?? {}) as Record<string, unknown>;

  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string"
        ? params.protocolVersion
        : "";
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.has(asked)
          ? asked
          : MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
        })),
      });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!MCP_TOOLS.some((t) => t.name === name)) {
        return rpcError(id, INVALID_PARAMS, `Unknown tool: ${name}`);
      }
      const args = params.arguments ?? {};
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        return rpcError(id, INVALID_PARAMS, "arguments must be an object");
      }
      const result = await call(name, args);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result.content) }],
        // Objects also go out structured, so clients that read it skip the
        // text round trip; a bare string or error message stays text only.
        ...(typeof result.content === "object" && result.content !== null &&
            !Array.isArray(result.content) && !result.is_error
          ? { structuredContent: result.content }
          : {}),
        isError: result.is_error,
      });
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
  }
}
