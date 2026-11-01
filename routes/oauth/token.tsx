import { handler } from "./$token.ts";
import { getBaseUrl } from "../../lib/auth.ts";
import {
  createOAuthGrant,
  deleteExpiredOAuthGrants,
  refreshOAuthGrant,
} from "../../lib/api-tokens.ts";
import {
  deleteExpiredCodes,
  isMcpResource,
  redeemAuthorizationCode,
} from "../../lib/oauth.ts";

// The OAuth token endpoint: trades an authorization code or a refresh token
// for an access token. Clients are public (PKCE, no secret), and browser
// based ones call this cross-origin, so it answers CORS preflights. No
// cookie is ever read here.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type",
};

function tokenResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  });
}

function oauthError(error: string, description: string): Response {
  return tokenResponse({ error, error_description: description }, 400);
}

export const handlers = handler({
  OPTIONS() {
    return new Response(null, { status: 204, headers: CORS });
  },
  async POST(ctx) {
    const q = ctx.state.db.query;
    if (Math.random() < 0.05) {
      deleteExpiredCodes(q).catch(() => {});
      deleteExpiredOAuthGrants(q).catch(() => {});
    }

    let form: URLSearchParams;
    try {
      form = new URLSearchParams(await ctx.req.text());
    } catch {
      return oauthError("invalid_request", "Body is not form encoded");
    }
    const clientId = form.get("client_id") ?? "";
    if (!clientId) return oauthError("invalid_client", "client_id is required");
    const resource = form.get("resource");
    if (resource !== null && !isMcpResource(resource, getBaseUrl(ctx.req))) {
      return oauthError("invalid_target", "Unknown resource");
    }

    switch (form.get("grant_type")) {
      case "authorization_code": {
        const redeemed = await redeemAuthorizationCode(
          q,
          form.get("code") ?? "",
          clientId,
          form.get("redirect_uri") ?? "",
          form.get("code_verifier") ?? "",
        );
        if (!redeemed) {
          return oauthError("invalid_grant", "Code is invalid or expired");
        }
        return tokenResponse(
          await createOAuthGrant(
            q,
            redeemed.userId,
            clientId,
            redeemed.clientName,
          ),
        );
      }
      case "refresh_token": {
        const tokens = await refreshOAuthGrant(
          q,
          clientId,
          form.get("refresh_token") ?? "",
        );
        if (!tokens) {
          return oauthError("invalid_grant", "Refresh token is invalid");
        }
        return tokenResponse(tokens);
      }
      default:
        return oauthError(
          "unsupported_grant_type",
          "Use authorization_code or refresh_token",
        );
    }
  },
});
