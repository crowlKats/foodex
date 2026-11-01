// OAuth 2.1 authorization server for the MCP endpoint, so a client can
// connect by signing the user in instead of asking for a pasted token.
//
// Clients identify themselves with a Client ID Metadata Document (CIMD): the
// client_id is an HTTPS URL that serves JSON naming the client and listing
// its redirect URIs. Fetching that document replaces client registration,
// so nothing about a client is stored until the user approves it. Only
// public clients are supported (PKCE, no client secret), which is every MCP
// client in practice.
//
// Grants become api_tokens rows (lib/api-tokens.ts); the routes are
// /.well-known/oauth-*, /oauth/authorize and /oauth/token.

import type { QueryFn } from "../db/mod.ts";
import { base64url, hashToken } from "./api-tokens.ts";

/** How long the user has between approving and the client redeeming. */
const CODE_TTL_SECONDS = 5 * 60;
/** The CIMD spec suggests capping documents around 5 KB. */
const MAX_METADATA_BYTES = 5 * 1024;
const METADATA_TIMEOUT_MS = 5_000;
const METADATA_CACHE_MS = 5 * 60_000;
const METADATA_CACHE_MAX = 500;

// ── metadata ───────────────────────────────────────────────────────

/** The MCP endpoint, as a resource indicator (RFC 8707). */
export function mcpResource(origin: string): string {
  return `${origin}/mcp`;
}

/** Where the MCP endpoint's protected resource metadata lives. */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

/** RFC 9728: which authorization server guards the MCP endpoint. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    resource_name: "Foodex",
    resource_documentation: `${origin}/docs/mcp`,
  };
}

/** RFC 8414, plus the CIMD flag that tells clients to skip registration. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/docs/mcp`,
  };
}

/** Whether a `resource` parameter names the MCP endpoint. */
export function isMcpResource(value: string, origin: string): boolean {
  return value.replace(/\/$/, "") === mcpResource(origin);
}

// ── client metadata documents ──────────────────────────────────────

export interface ClientMetadata {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

/**
 * The rules a client_id URL must follow: HTTPS, a path, and nothing that
 * would let two spellings name the same document (dot segments) or smuggle
 * credentials or fragments. Returns the parsed URL or null.
 */
export function parseClientId(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || raw.includes("#")) return null;
  if (url.pathname === "/" || url.pathname === "") return null;
  // URL parsing resolves dot segments, so compare against the raw path.
  const rawPath = raw.slice(raw.indexOf("//") + 2).replace(/^[^/]*/, "")
    .split(/[?#]/)[0];
  if (rawPath.split("/").some((s) => s === "." || s === "..")) return null;
  return url;
}

/**
 * Check a fetched document against the client_id it was fetched from.
 * Returns the metadata or a reason for refusing it.
 */
export function parseClientMetadata(
  doc: unknown,
  clientId: string,
): ClientMetadata | string {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return "metadata is not a JSON object";
  }
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) {
    return "metadata client_id does not match its URL";
  }
  if (
    !Array.isArray(d.redirect_uris) || d.redirect_uris.length === 0 ||
    !d.redirect_uris.every((u) => typeof u === "string")
  ) {
    return "metadata lists no redirect_uris";
  }
  // A CIMD client cannot hold a shared secret: the document is public.
  const auth = d.token_endpoint_auth_method ?? "none";
  if (auth !== "none") {
    return `token_endpoint_auth_method ${String(auth)} is not supported`;
  }
  const host = new URL(clientId).hostname;
  const name = typeof d.client_name === "string" && d.client_name.trim()
    ? d.client_name.trim().slice(0, 100)
    : host;
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: d.redirect_uris as string[],
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether a redirect URI is one the client registered. Exact match, except
 * that loopback URIs match on any port: native clients like Claude Code
 * listen on whatever port is free (RFC 8252 section 7.3).
 */
export function redirectUriAllowed(
  client: ClientMetadata,
  redirectUri: string,
): boolean {
  let asked: URL;
  try {
    asked = new URL(redirectUri);
  } catch {
    return false;
  }
  if (asked.protocol === "javascript:" || asked.protocol === "data:") {
    return false;
  }
  return client.redirect_uris.some((registered) => {
    if (registered === redirectUri) return true;
    let reg: URL;
    try {
      reg = new URL(registered);
    } catch {
      return false;
    }
    return reg.protocol === "http:" && asked.protocol === "http:" &&
      LOOPBACK_HOSTS.has(reg.hostname) && reg.hostname === asked.hostname &&
      reg.pathname === asked.pathname && reg.search === asked.search;
  });
}

/**
 * Whether an IP address is on the public internet. Fetching a client_id
 * makes this server request a URL the caller picked, so private, loopback
 * and link-local targets are refused to keep it from probing the network
 * it runs in.
 */
export function isPublicAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(ip.replace(/^\[|\]$/g, ""));
  if (!v6) return false;
  if (v6.every((h) => h === 0)) return false; // ::
  if (v6.slice(0, 7).every((h) => h === 0) && v6[7] === 1) return false; // ::1
  if ((v6[0] & 0xfe00) === 0xfc00) return false; // unique local
  if ((v6[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((v6[0] & 0xff00) === 0xff00) return false; // multicast
  const embedsV4 =
    // ::ffff:a.b.c.d
    (v6.slice(0, 5).every((h) => h === 0) && v6[5] === 0xffff) ||
    // 64:ff9b::a.b.c.d (NAT64)
    (v6[0] === 0x64 && v6[1] === 0xff9b &&
      v6.slice(2, 6).every((h) => h === 0));
  if (embedsV4) {
    return isPublicIPv4([v6[6] >> 8, v6[6] & 0xff, v6[7] >> 8, v6[7] & 0xff]);
  }
  return true;
}

function parseIPv4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function isPublicIPv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b < 128) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b < 32) return false;
  if (a === 192 && (b === 168 || b === 0)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function parseIPv6(ip: string): number[] | null {
  if (!ip.includes(":")) return null;
  let tail: number[] = [];
  const lastColon = ip.lastIndexOf(":");
  const v4 = parseIPv4(ip.slice(lastColon + 1));
  if (v4) {
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    // Keep a "::" the dotted part hung off; drop a lone separator.
    const head = ip.slice(0, lastColon + 1);
    ip = head.endsWith("::") ? head : head.slice(0, -1);
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const toHextets = (s: string) => s === "" ? [] : s.split(":");
  const head = toHextets(halves[0]);
  const rest = halves.length === 2 ? toHextets(halves[1]) : [];
  const groups = head.length + rest.length + tail.length;
  if (halves.length === 1 ? groups !== 8 : groups > 7) return null;
  const fill = halves.length === 2 ? Array(8 - groups).fill("0") : [];
  const all = [...head, ...fill, ...rest];
  const parsed = all.map((h) =>
    /^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN
  );
  if (parsed.some(Number.isNaN)) return null;
  return [...parsed, ...tail];
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (parseIPv4(hostname) || hostname.startsWith("[")) {
    if (!isPublicAddress(hostname)) throw new Error("address is not public");
    return;
  }
  const addresses: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      addresses.push(...await Deno.resolveDns(hostname, type));
    } catch {
      // No records of this type.
    }
  }
  if (addresses.length === 0) throw new Error("host does not resolve");
  if (!addresses.every(isPublicAddress)) {
    throw new Error("host resolves to a private address");
  }
}

const metadataCache = new Map<
  string,
  { metadata: ClientMetadata; expires: number }
>();

/**
 * Fetch and check a client's metadata document. Throws with a reason the
 * consent page can show when the client cannot be trusted. Documents are
 * cached briefly, since one authorization fetches it twice (page and
 * submit).
 */
export async function fetchClientMetadata(
  clientId: string,
): Promise<ClientMetadata> {
  const cached = metadataCache.get(clientId);
  if (cached && cached.expires > Date.now()) return cached.metadata;

  const url = parseClientId(clientId);
  if (!url) throw new Error("client_id is not a valid metadata URL");
  await assertPublicHost(url.hostname);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
  } catch {
    throw new Error("could not fetch the client's metadata");
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new Error(`client metadata returned HTTP ${res.status}`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_METADATA_BYTES) {
      await reader.cancel();
      throw new Error("client metadata is too large");
    }
    chunks.push(value);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder().decode(concat(chunks, size)));
  } catch {
    throw new Error("client metadata is not JSON");
  }
  const metadata = parseClientMetadata(doc, clientId);
  if (typeof metadata === "string") throw new Error(metadata);

  if (metadataCache.size >= METADATA_CACHE_MAX) {
    metadataCache.delete(metadataCache.keys().next().value!);
  }
  metadataCache.set(clientId, {
    metadata,
    expires: Date.now() + METADATA_CACHE_MS,
  });
  return metadata;
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// ── authorization requests ─────────────────────────────────────────

/** A checked request to /oauth/authorize. */
export interface AuthorizeRequest {
  client: ClientMetadata;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

/**
 * The outcome of checking an authorization request. Until the client and
 * redirect URI check out, errors are shown on the page: redirecting to an
 * unverified URI would make this an open redirector. After that, errors go
 * back to the client.
 */
export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; show: string }
  | { ok: false; redirect: string };

export async function checkAuthorizeRequest(
  params: URLSearchParams,
  origin: string,
  fetchMetadata: (clientId: string) => Promise<ClientMetadata> =
    fetchClientMetadata,
): Promise<AuthorizeCheck> {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  if (!parseClientId(clientId)) {
    return {
      ok: false,
      show: "The app did not identify itself with a client metadata URL, " +
        "which Foodex requires.",
    };
  }
  let client: ClientMetadata;
  try {
    client = await fetchMetadata(clientId);
  } catch (err) {
    return {
      ok: false,
      show: `Foodex could not verify the app: ${(err as Error).message}.`,
    };
  }
  if (!redirectUri || !redirectUriAllowed(client, redirectUri)) {
    return {
      ok: false,
      show: "The app asked to be sent back to an address it has not " +
        "registered.",
    };
  }

  const state = params.get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    redirect: authorizationResponseUrl(redirectUri, origin, {
      error,
      error_description: description,
      state,
    }),
  });
  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code");
  }
  const codeChallenge = params.get("code_challenge") ?? "";
  if (
    params.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  ) {
    return fail("invalid_request", "PKCE with S256 is required");
  }
  const resource = params.get("resource");
  if (resource !== null && !isMcpResource(resource, origin)) {
    return fail("invalid_target", "Unknown resource");
  }
  return { ok: true, request: { client, redirectUri, codeChallenge, state } };
}

/**
 * The redirect back to the client: its URI with the response parameters
 * added, plus `iss` so it can tell which server answered (RFC 9207).
 */
export function authorizationResponseUrl(
  redirectUri: string,
  origin: string,
  params: Record<string, string | null>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  url.searchParams.set("iss", origin);
  return url.href;
}

// ── codes ──────────────────────────────────────────────────────────

/** Store a code for an approved request; returns the code itself. */
export async function createAuthorizationCode(
  q: QueryFn,
  userId: string,
  request: AuthorizeRequest,
): Promise<string> {
  const code = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await q(
    `INSERT INTO oauth_codes (code_hash, user_id, client_id, client_name,
       redirect_uri, code_challenge, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))`,
    [
      await hashToken(code),
      userId,
      request.client.client_id,
      request.client.client_name,
      request.redirectUri,
      request.codeChallenge,
      CODE_TTL_SECONDS,
    ],
  );
  return code;
}

export interface RedeemedCode {
  userId: string;
  clientName: string;
}

/**
 * Redeem a code. It is deleted whatever the outcome, so a code that fails
 * a check once cannot be retried. Null unless the code is live and the
 * client, redirect URI and PKCE verifier all match what was approved.
 */
export async function redeemAuthorizationCode(
  q: QueryFn,
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<RedeemedCode | null> {
  const res = await q<{
    user_id: string;
    client_id: string;
    client_name: string;
    redirect_uri: string;
    code_challenge: string;
    live: boolean;
  }>(
    `DELETE FROM oauth_codes WHERE code_hash = $1
     RETURNING user_id, client_id, client_name, redirect_uri, code_challenge,
       expires_at > now() AS live`,
    [await hashToken(code)],
  );
  const row = res.rows[0];
  if (!row || !row.live) return null;
  if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
    return null;
  }
  if (!(await verifyPkce(codeVerifier, row.code_challenge))) return null;
  return { userId: row.user_id, clientName: row.client_name };
}

/** Check a PKCE verifier against its S256 challenge (RFC 7636). */
export async function verifyPkce(
  verifier: string,
  challenge: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest)) === challenge;
}

export async function deleteExpiredCodes(q: QueryFn): Promise<void> {
  await q("DELETE FROM oauth_codes WHERE expires_at < now()");
}

// ── responses ──────────────────────────────────────────────────────

/** Metadata is public, and browser-based clients read it cross-origin. */
export function metadataResponse(body: unknown): Response {
  return Response.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
