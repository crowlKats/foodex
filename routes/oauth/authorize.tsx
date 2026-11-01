import type { ComponentChildren } from "preact";
import { handler, page } from "./$authorize.ts";
import { getBaseUrl, loginUrl } from "../../lib/auth.ts";
import {
  authorizationResponseUrl,
  type AuthorizeCheck,
  type AuthorizeProblem,
  checkAuthorizeRequest,
  createAuthorizationCode,
} from "../../lib/oauth.ts";
import { Button } from "../../components/Button.tsx";
import { contentSecurityPolicy } from "../../lib/csp.ts";
import { createT } from "../../components/Translation.tsx";
import { pickBundle } from "../../lib/i18n/locale.ts";
import { t as shared } from "../../locales/shared.ts";
import en from "./authorize.en.mfr";
import it from "./authorize.it.mfr";

const t = createT({ en, it });

// The OAuth authorization endpoint: an MCP client sends the user here to
// approve it. GET checks the request and shows the consent page; the page
// posts back the same parameters with the user's decision, which are checked
// again before a code is issued.

type AuthorizeData =
  | { kind: "error"; problem: AuthorizeProblem; detail: string | null }
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

/**
 * The consent page's policy. Its form ends in a redirect to the client, and
 * browsers hold that redirect to form-action too, so the client's origin
 * (or scheme, for an app link like cursor://) has to be allowed. Framing
 * stays forbidden, or another site could overlay the page and trick the
 * user into clicking Allow.
 */
function consentPolicy(redirectUri: string): string {
  const target = new URL(redirectUri);
  const source = target.origin === "null" ? target.protocol : target.origin;
  return contentSecurityPolicy({ formAction: [source] });
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/** Turn a failed check into the page or redirect it calls for. */
function failure(check: Exclude<AuthorizeCheck, { ok: true }>) {
  if ("redirect" in check) return redirect(check.redirect);
  return {
    data: {
      kind: "error",
      problem: check.show,
      detail: check.detail ?? null,
    } satisfies AuthorizeData,
    status: 400,
  };
}

export const handlers = handler({
  async GET(ctx) {
    const bundle = pickBundle(ctx.state.locale, { en, it });
    ctx.state.pageTitle = bundle.get("oauth.title").format();
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
        householdName: household.rows[0]?.name ??
          bundle.get("oauth.yourHousehold").format(),
        params: [...ctx.url.searchParams],
      } satisfies AuthorizeData,
      headers: { "Content-Security-Policy": consentPolicy(redirectUri) },
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

function Mono({ children }: { children?: ComponentChildren }) {
  return <span class="font-mono">{children}</span>;
}

export default page(function Authorize({ data, state }) {
  if (data.kind === "error") {
    return (
      <div class="max-w-md mx-auto mt-16">
        <h1 class="text-2xl font-bold text-center mb-8">
          {t("oauth.errorHeading")}
        </h1>
        <div class="card">
          <p class="text-sm mb-3">
            {t(`oauth.error.${data.problem}`, { detail: data.detail ?? "" })}
          </p>
          <p class="text-xs text-stone-500">{t("oauth.nothingShared")}</p>
        </div>
      </div>
    );
  }

  return (
    <div class="max-w-md mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-8">
        {t("oauth.heading", { client: data.clientName })}
      </h1>
      <div class="card space-y-4">
        <div class="text-sm">
          <p class="mb-1">
            {t("oauth.wantsAccess", {
              client: data.clientName,
              user: state.user?.name ?? "",
              household: data.householdName,
            }, { bold: ({ children }) => <strong>{children}</strong> })}
          </p>
          <p class="text-xs text-stone-500">
            {data.redirectHost
              ? t("oauth.identifiedByReturning", {
                clientHost: data.clientHost,
                redirectHost: data.redirectHost,
              }, { code: Mono })
              : t("oauth.identifiedBy", { clientHost: data.clientHost }, {
                code: Mono,
              })}
          </p>
        </div>
        <div class="text-sm">
          <p class="mb-1">{t("oauth.canDo")}</p>
          <ul class="list-disc pl-5 space-y-0.5">
            <li>{t("oauth.canRead")}</li>
            <li>{t("oauth.canWrite")}</li>
          </ul>
          <p class="text-xs text-stone-500 mt-2">
            {t("oauth.limits", {}, {
              link: ({ children }) => (
                <a href="/profile" class="link">{children}</a>
              ),
            })}
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
            {shared("common.cancel")}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="allow"
            variant="primary"
            class="flex-1"
          >
            {t("oauth.allow")}
          </Button>
        </form>
      </div>
    </div>
  );
});
