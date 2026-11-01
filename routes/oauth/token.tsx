import { handler } from "./$token.ts";
import { getBaseUrl } from "../../lib/auth.ts";
import {
  createOAuthGrant,
  deleteExpiredOAuthGrants,
  refreshOAuthGrant,
} from "../../lib/api-tokens.ts";
import {
  type ClientMetadata,
  deleteExpiredCodes,
  fetchClientKeys,
  fetchClientMetadata,
  isMcpResource,
  redeemAuthorizationCode,
} from "../../lib/oauth.ts";
import {
  CLIENT_ASSERTION_TYPE,
  verifyClientAssertion,
} from "../../lib/oauth-client-auth.ts";

// The OAuth token endpoint: trades an authorization code or a refresh token
// for an access token. Clients are either public (PKCE alone) or sign a
// client assertion with a key from their metadata (private_key_jwt, which
// ChatGPT uses). Browser based clients call this cross-origin, so it
// answers CORS preflights. No cookie is ever read here.

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
  return tokenResponse(
    { error, error_description: description },
    error === "invalid_client" ? 401 : 400,
  );
}

/**
 * Check the client assertion on a request, if it has one. Returns whether
 * the client authenticated, or an error response when it tried and failed.
 */
async function authenticateClient(
  form: URLSearchParams,
  clientId: string,
  origin: string,
): Promise<boolean | Response> {
  const assertion = form.get("client_assertion");
  const assertionType = form.get("client_assertion_type");
  if (assertion === null && assertionType === null) return false;
  if (assertionType !== CLIENT_ASSERTION_TYPE || !assertion) {
    return oauthError("invalid_client", "Unsupported client assertion");
  }
  let client: ClientMetadata;
  try {
    client = await fetchClientMetadata(clientId);
  } catch (err) {
    return oauthError("invalid_client", (err as Error).message);
  }
  if (!client.auth_methods.includes("private_key_jwt")) {
    return oauthError("invalid_client", "Client does not use private_key_jwt");
  }
  let reason: string | null;
  try {
    reason = await verifyClientAssertion(assertion, {
      clientId,
      audiences: [`${origin}/oauth/token`, origin],
      getKeys: (refresh) => fetchClientKeys(client, refresh),
    });
  } catch (err) {
    reason = (err as Error).message;
  }
  return reason ? oauthError("invalid_client", reason) : true;
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
    const origin = getBaseUrl(ctx.req);
    const resource = form.get("resource");
    if (resource !== null && !isMcpResource(resource, origin)) {
      return oauthError("invalid_target", "Unknown resource");
    }
    const authenticated = await authenticateClient(form, clientId, origin);
    if (authenticated instanceof Response) return authenticated;

    switch (form.get("grant_type")) {
      case "authorization_code": {
        const redeemed = await redeemAuthorizationCode(
          q,
          form.get("code") ?? "",
          clientId,
          form.get("redirect_uri") ?? "",
          form.get("code_verifier") ?? "",
          authenticated,
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
            authenticated ? "private_key_jwt" : "none",
          ),
        );
      }
      case "refresh_token": {
        const tokens = await refreshOAuthGrant(
          q,
          clientId,
          form.get("refresh_token") ?? "",
          authenticated,
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
