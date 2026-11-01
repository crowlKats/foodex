import { assert, assertEquals } from "@std/assert";
import {
  checkAuthorizeRequest,
  type ClientMetadata,
  isPublicAddress,
  parseClientId,
  parseClientMetadata,
  redirectUriAllowed,
  verifyPkce,
} from "./oauth.ts";

const CLIENT_ID = "https://app.example/oauth/client.json";
const client: ClientMetadata = {
  client_id: CLIENT_ID,
  client_name: "Example",
  redirect_uris: ["http://localhost/callback", "https://app.example/cb"],
};

Deno.test("parseClientId accepts https URLs with a path only", () => {
  assert(parseClientId(CLIENT_ID));
  assert(parseClientId("https://app.example/client?v=1"));
  assertEquals(parseClientId("http://app.example/client.json"), null);
  assertEquals(parseClientId("https://app.example/"), null);
  assertEquals(parseClientId("https://app.example"), null);
  assertEquals(parseClientId("https://app.example/a#frag"), null);
  assertEquals(parseClientId("https://user:pw@app.example/a"), null);
  assertEquals(parseClientId("https://app.example/a/../b"), null);
  assertEquals(parseClientId("https://app.example/./b"), null);
  assertEquals(parseClientId("not a url"), null);
});

Deno.test("parseClientMetadata checks the document against its URL", () => {
  const ok = parseClientMetadata(
    { client_id: CLIENT_ID, client_name: " Example ", redirect_uris: ["x:/"] },
    CLIENT_ID,
  );
  assertEquals(ok, {
    client_id: CLIENT_ID,
    client_name: "Example",
    redirect_uris: ["x:/"],
  });
  // No name: fall back to the host, which is what the user can trust.
  const unnamed = parseClientMetadata(
    { client_id: CLIENT_ID, redirect_uris: ["x:/"] },
    CLIENT_ID,
  );
  assertEquals((unnamed as ClientMetadata).client_name, "app.example");

  const bad = [
    null,
    [],
    { client_id: "https://other.example/c", redirect_uris: ["x:/"] },
    { client_id: CLIENT_ID },
    { client_id: CLIENT_ID, redirect_uris: [] },
    { client_id: CLIENT_ID, redirect_uris: [1] },
    {
      client_id: CLIENT_ID,
      redirect_uris: ["x:/"],
      token_endpoint_auth_method: "client_secret_basic",
    },
  ];
  for (const doc of bad) {
    assertEquals(typeof parseClientMetadata(doc, CLIENT_ID), "string");
  }
});

Deno.test("redirectUriAllowed matches exactly, loopback on any port", () => {
  assert(redirectUriAllowed(client, "https://app.example/cb"));
  assert(redirectUriAllowed(client, "http://localhost/callback"));
  assert(redirectUriAllowed(client, "http://localhost:51234/callback"));
  assert(!redirectUriAllowed(client, "http://localhost:51234/other"));
  assert(!redirectUriAllowed(client, "http://127.0.0.1:51234/callback"));
  assert(!redirectUriAllowed(client, "https://app.example:8443/cb"));
  assert(!redirectUriAllowed(client, "https://app.example/cb/evil"));
  assert(!redirectUriAllowed(client, "https://evil.example/cb"));
  assert(!redirectUriAllowed(client, "not a url"));
});

Deno.test("isPublicAddress refuses private and special ranges", () => {
  for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700::1111"]) {
    assert(isPublicAddress(ip), ip);
  }
  for (
    const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "[::1]",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::10.0.0.1",
      "garbage",
    ]
  ) {
    assert(!isPublicAddress(ip), ip);
  }
  assert(isPublicAddress("::ffff:1.1.1.1"));
});

Deno.test("verifyPkce checks S256", async () => {
  // The example from RFC 7636 appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  assert(await verifyPkce(verifier, challenge));
  assert(!(await verifyPkce(verifier + "x", challenge)));
  assert(!(await verifyPkce("short", challenge)));
});

const ORIGIN = "https://foodex.example";
const fetchMetadata = (id: string) =>
  id === CLIENT_ID
    ? Promise.resolve(client)
    : Promise.reject(new Error("HTTP 404"));

function authorizeParams(overrides: Record<string, string | null> = {}) {
  const base: Record<string, string | null> = {
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: "http://localhost:4000/callback",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${ORIGIN}/mcp`,
    ...overrides,
  };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== null) params.set(k, v);
  return params;
}

Deno.test("checkAuthorizeRequest accepts a well-formed request", async () => {
  const check = await checkAuthorizeRequest(
    authorizeParams(),
    ORIGIN,
    fetchMetadata,
  );
  assert(check.ok);
  assertEquals(check.request.state, "xyz");
  assertEquals(check.request.redirectUri, "http://localhost:4000/callback");
});

Deno.test("checkAuthorizeRequest shows client problems instead of redirecting", async () => {
  const cases: Record<string, string | null>[] = [
    { client_id: "my-app" },
    { client_id: "https://unknown.example/c" },
    { redirect_uri: "https://evil.example/cb" },
    { redirect_uri: null },
  ];
  for (const overrides of cases) {
    const check = await checkAuthorizeRequest(
      authorizeParams(overrides),
      ORIGIN,
      fetchMetadata,
    );
    assert(!check.ok && "show" in check, JSON.stringify(overrides));
  }
});

Deno.test("checkAuthorizeRequest sends request problems back to the client", async () => {
  const cases: [Record<string, string | null>, string][] = [
    [{ response_type: "token" }, "unsupported_response_type"],
    [{ code_challenge: null }, "invalid_request"],
    [{ code_challenge_method: "plain" }, "invalid_request"],
    [{ resource: "https://other.example/mcp" }, "invalid_target"],
  ];
  for (const [overrides, error] of cases) {
    const check = await checkAuthorizeRequest(
      authorizeParams(overrides),
      ORIGIN,
      fetchMetadata,
    );
    assert(!check.ok && "redirect" in check);
    const url = new URL(check.redirect);
    assertEquals(url.origin + url.pathname, "http://localhost:4000/callback");
    assertEquals(url.searchParams.get("error"), error);
    assertEquals(url.searchParams.get("state"), "xyz");
    assertEquals(url.searchParams.get("iss"), ORIGIN);
  }
  // No resource at all is fine: it defaults to the MCP endpoint.
  const check = await checkAuthorizeRequest(
    authorizeParams({ resource: null }),
    ORIGIN,
    fetchMetadata,
  );
  assert(check.ok);
});
