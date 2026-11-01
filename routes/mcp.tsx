import { handler } from "./$mcp.ts";
import {
  authenticateApiToken,
  bearerToken,
  touchApiToken,
} from "../lib/api-tokens.ts";
import { handleMcpBody, PARSE_ERROR } from "../lib/mcp.ts";
import { resourceMetadataUrl } from "../lib/oauth.ts";
import { getBaseUrl } from "../lib/auth.ts";
import { executeTool } from "../lib/agent/tools.ts";
import { rateLimit } from "../lib/rate-limit.ts";

// The MCP endpoint. Stateless Streamable HTTP: every call is one POST with
// a bearer token, either a personal one from the profile page or one issued
// through OAuth (routes/oauth); there is no session to keep and no
// server-initiated stream, so GET and DELETE have nothing to do.

/**
 * A 401 points at the protected resource metadata, which is how an OAuth
 * client finds out where to sign the user in (RFC 9728). A request that
 * sent no token gets no error code (RFC 6750 section 3.1).
 */
function unauthorized(req: Request, message: string, sentToken: boolean) {
  const params = [
    'realm="foodex"',
    `resource_metadata="${resourceMetadataUrl(getBaseUrl(req))}"`,
  ];
  if (sentToken) params.push('error="invalid_token"');
  return Response.json({ error: message }, {
    status: 401,
    headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` },
  });
}

export const handlers = handler({
  GET() {
    // No server-to-client stream; the spec lets a server decline it.
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  },
  DELETE() {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  },
  async POST(ctx) {
    const { req } = ctx;
    const q = ctx.state.db.query;

    // A browser page cannot legitimately reach this endpoint: the token
    // lives in a header, never in a cookie. Rejecting cross-origin
    // requests up front keeps DNS rebinding out, as the spec asks.
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) {
      return Response.json({ error: "Forbidden origin" }, { status: 403 });
    }

    const secret = bearerToken(req);
    if (!secret) return unauthorized(req, "Missing bearer token", false);
    const principal = await authenticateApiToken(q, secret);
    if (!principal) return unauthorized(req, "Invalid token", true);
    if (!principal.householdId) {
      return Response.json(
        { error: "Join or create a household to use Foodex over MCP." },
        { status: 403 },
      );
    }
    if (!rateLimit(`mcp:${principal.tokenId}`, 120, 60_000)) {
      return Response.json({ error: "Too many requests" }, {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
    touchApiToken(q, principal.tokenId).catch(() => {});

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: PARSE_ERROR, message: "Body is not JSON" },
        },
        { status: 400 },
      );
    }

    const householdId = principal.householdId;
    const outcome = await handleMcpBody(
      body,
      (name, input) =>
        executeTool(name, input, "mcp", { q, householdId, events: [] }),
    );
    if (outcome.body === null) return new Response(null, { status: 202 });
    return Response.json(outcome.body, { status: outcome.status });
  },
});
