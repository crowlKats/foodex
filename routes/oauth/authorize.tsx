import { handler, page } from "./$authorize.ts";
import { getBaseUrl, loginUrl } from "../../lib/auth.ts";
import {
  authorizationResponseUrl,
  type AuthorizeCheck,
  checkAuthorizeRequest,
  createAuthorizationCode,
} from "../../lib/oauth.ts";
import { Button } from "../../components/Button.tsx";

// The OAuth authorization endpoint: an MCP client sends the user here to
// approve it. GET checks the request and shows the consent page; the page
// posts back the same parameters with the user's decision, which are checked
// again before a code is issued.

type AuthorizeData =
  | { kind: "error"; message: string }
  | {
    kind: "consent";
    clientName: string;
    /** Where the client's metadata lives: the part the name can't fake. */
    clientHost: string;
    /** Set when the user is sent back somewhere other than clientHost. */
    redirectHost: string | null;
    householdName: string;
    params: [string, string][];
  };

// The consent page must not be framed, or another site could overlay it
// and trick the user into clicking Allow.
const NO_FRAMING = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/** Turn a failed check into the page or redirect it calls for. */
function failure(check: Exclude<AuthorizeCheck, { ok: true }>) {
  if ("redirect" in check) return redirect(check.redirect);
  return {
    data: { kind: "error", message: check.show } satisfies AuthorizeData,
    status: 400,
    headers: NO_FRAMING,
  };
}

export const handlers = handler({
  async GET(ctx) {
    ctx.state.pageTitle = "Connect an app";
    const origin = getBaseUrl(ctx.req);
    const check = await checkAuthorizeRequest(ctx.url.searchParams, origin);
    if (!check.ok) return failure(check);
    if (!ctx.state.user) {
      return redirect(loginUrl(ctx.url.pathname + ctx.url.search));
    }

    const { client, redirectUri } = check.request;
    const clientHost = new URL(client.client_id).host;
    const target = new URL(redirectUri);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      target.hostname,
    );
    const household = await ctx.state.db.query<{ name: string }>(
      "SELECT name FROM households WHERE id = $1",
      [ctx.state.householdId],
    );
    return {
      data: {
        kind: "consent",
        clientName: client.client_name,
        clientHost,
        redirectHost: loopback || target.host === clientHost
          ? null
          : target.host || target.protocol,
        householdName: household.rows[0]?.name ?? "your household",
        params: [...ctx.url.searchParams],
      } satisfies AuthorizeData,
      headers: NO_FRAMING,
    };
  },
  async POST(ctx) {
    const origin = getBaseUrl(ctx.req);
    // The session cookie is SameSite=Lax, so a cross-site form post arrives
    // signed out anyway; checking Origin makes the refusal explicit.
    const reqOrigin = ctx.req.headers.get("origin");
    if (reqOrigin && reqOrigin !== origin) {
      return new Response("Forbidden origin", { status: 403 });
    }
    if (!ctx.state.user) return redirect("/auth/login");

    const form = await ctx.req.formData();
    const params = new URLSearchParams();
    for (const [key, value] of form) {
      if (key !== "decision" && typeof value === "string") {
        params.append(key, value);
      }
    }
    const check = await checkAuthorizeRequest(params, origin);
    if (!check.ok) return failure(check);
    const { request } = check;

    if (form.get("decision") !== "allow") {
      return redirect(authorizationResponseUrl(request.redirectUri, origin, {
        error: "access_denied",
        state: request.state,
      }));
    }
    const code = await createAuthorizationCode(
      ctx.state.db.query,
      ctx.state.user.id,
      request,
    );
    return redirect(authorizationResponseUrl(request.redirectUri, origin, {
      code,
      state: request.state,
    }));
  },
});

export default page(function Authorize({ data, state }) {
  if (data.kind === "error") {
    return (
      <div class="max-w-md mx-auto mt-16">
        <h1 class="text-2xl font-bold text-center mb-8">
          Can't connect this app
        </h1>
        <div class="card">
          <p class="text-sm mb-3">{data.message}</p>
          <p class="text-xs text-stone-500">
            Nothing was shared with it. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="max-w-md mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-8">
        Connect {data.clientName}?
      </h1>
      <div class="card space-y-4">
        <div class="text-sm">
          <p class="mb-1">
            <strong>{data.clientName}</strong> wants to use Foodex as you,{" "}
            {state.user?.name}, in <strong>{data.householdName}</strong>.
          </p>
          <p class="text-xs text-stone-500">
            Identified by <span class="font-mono">{data.clientHost}</span>
            {data.redirectHost && (
              <>
                , returning you to{" "}
                <span class="font-mono">{data.redirectHost}</span>
              </>
            )}
          </p>
        </div>
        <div class="text-sm">
          <p class="mb-1">It will be able to:</p>
          <ul class="list-disc pl-5 space-y-0.5">
            <li>read your household's recipes, pantry, plan and list</li>
            <li>add meals to the plan and items to the list and pantry</li>
          </ul>
          <p class="text-xs text-stone-500 mt-2">
            It can't create or change recipes. Disconnect it any time from your
            {" "}
            <a href="/profile" class="link">Profile</a>.
          </p>
        </div>
        <form method="POST" class="flex gap-2">
          {data.params.map(([key, value]) => (
            <input type="hidden" name={key} value={value} />
          ))}
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            class="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            name="decision"
            value="allow"
            variant="primary"
            class="flex-1"
          >
            Allow
          </Button>
        </form>
      </div>
    </div>
  );
});
