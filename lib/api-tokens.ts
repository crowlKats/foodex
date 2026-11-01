// API tokens: bearer credentials for programs acting as a user (the MCP
// endpoint). A personal token is minted on the profile and shown once; an
// OAuth grant is minted by the token endpoint and expires, renewed through a
// refresh token. Only hashes are stored.

import type { QueryFn } from "../db/mod.ts";

/** The prefix every token starts with, so a leaked one is recognizable. */
const TOKEN_PREFIX = "fx_";
const REFRESH_PREFIX = "fxr_";
/** OAuth access tokens live an hour; the client refreshes them quietly. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
/** A grant nobody refreshes for this long is dropped. */
const REFRESH_TOKEN_TTL_DAYS = 90;
/** Characters of the secret kept in clear for the list on the profile. */
const SHOWN_CHARS = 8;

export interface ApiTokenInfo {
  id: string;
  name: string;
  /** Enough of the secret to tell tokens apart: `fx_ab12cd34`. */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  /** The OAuth client's metadata URL; null for a personal token. */
  client_id: string | null;
}

export interface ApiTokenPrincipal {
  tokenId: string;
  userId: string;
  householdId: string | null;
}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hashToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newSecret(prefix: string): string {
  return prefix + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function shownPrefix(secret: string): string {
  return secret.slice(0, TOKEN_PREFIX.length + SHOWN_CHARS);
}

/** Mint a token for a user. Returns the secret, which is not stored. */
export async function createApiToken(
  q: QueryFn,
  userId: string,
  name: string,
): Promise<{ id: string; secret: string }> {
  const secret = newSecret(TOKEN_PREFIX);
  const res = await q<{ id: string }>(
    `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      userId,
      name,
      await hashToken(secret),
      shownPrefix(secret),
    ],
  );
  return { id: res.rows[0].id, secret };
}

/** What the token endpoint hands an OAuth client. */
export interface OAuthTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

async function oauthSecrets(): Promise<{
  tokens: OAuthTokens;
  params: [string, string, string];
}> {
  const access = newSecret(TOKEN_PREFIX);
  const refresh = newSecret(REFRESH_PREFIX);
  return {
    tokens: {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh,
    },
    params: [
      await hashToken(access),
      shownPrefix(access),
      await hashToken(refresh),
    ],
  };
}

/** Mint the tokens for an approved OAuth grant, named after the client. */
export async function createOAuthGrant(
  q: QueryFn,
  userId: string,
  clientId: string,
  name: string,
): Promise<OAuthTokens> {
  const { tokens, params } = await oauthSecrets();
  await q(
    `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix,
       refresh_token_hash, client_id, expires_at, refresh_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6,
       now() + make_interval(secs => $7),
       now() + make_interval(days => $8))`,
    [
      userId,
      name,
      ...params,
      clientId,
      ACCESS_TOKEN_TTL_SECONDS,
      REFRESH_TOKEN_TTL_DAYS,
    ],
  );
  return tokens;
}

/**
 * Trade a refresh token for a new pair. Both rotate, so a stolen refresh
 * token stops working once either party uses it. Null when the token is
 * unknown, expired, revoked or belongs to another client.
 */
export async function refreshOAuthGrant(
  q: QueryFn,
  clientId: string,
  refreshToken: string,
): Promise<OAuthTokens | null> {
  if (!refreshToken.startsWith(REFRESH_PREFIX)) return null;
  const { tokens, params } = await oauthSecrets();
  const res = await q(
    `UPDATE api_tokens
     SET token_hash = $1, token_prefix = $2, refresh_token_hash = $3,
         expires_at = now() + make_interval(secs => $6),
         refresh_expires_at = now() + make_interval(days => $7)
     WHERE refresh_token_hash = $4 AND client_id = $5
       AND refresh_expires_at > now()
     RETURNING id`,
    [
      ...params,
      await hashToken(refreshToken),
      clientId,
      ACCESS_TOKEN_TTL_SECONDS,
      REFRESH_TOKEN_TTL_DAYS,
    ],
  );
  return res.rows.length > 0 ? tokens : null;
}

/** Drop OAuth grants whose refresh token ran out. */
export async function deleteExpiredOAuthGrants(q: QueryFn): Promise<void> {
  await q("DELETE FROM api_tokens WHERE refresh_expires_at < now()");
}

export async function listApiTokens(
  q: QueryFn,
  userId: string,
): Promise<ApiTokenInfo[]> {
  const res = await q<{
    id: string;
    name: string;
    token_prefix: string;
    created_at: Date;
    last_used_at: Date | null;
    client_id: string | null;
  }>(
    `SELECT id, name, token_prefix, created_at, last_used_at, client_id
     FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.token_prefix,
    created_at: new Date(r.created_at).toISOString(),
    last_used_at: r.last_used_at
      ? new Date(r.last_used_at).toISOString()
      : null,
    client_id: r.client_id,
  }));
}

/** Delete a token; scoped to the user so nobody revokes someone else's. */
export async function revokeApiToken(
  q: QueryFn,
  userId: string,
  tokenId: string,
): Promise<void> {
  await q("DELETE FROM api_tokens WHERE id = $1 AND user_id = $2", [
    tokenId,
    userId,
  ]);
}

/** The bearer secret on a request, or null when there is none. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Resolve a bearer secret to the user it acts for. The household is the
 * user's current membership, looked up per request like a session's, so
 * leaving a household also cuts the token's access to it.
 */
export async function authenticateApiToken(
  q: QueryFn,
  secret: string,
): Promise<ApiTokenPrincipal | null> {
  if (!secret.startsWith(TOKEN_PREFIX)) return null;
  const res = await q<{
    id: string;
    user_id: string;
    household_id: string | null;
  }>(
    `SELECT t.id, t.user_id, hm.household_id
     FROM api_tokens t
     LEFT JOIN household_members hm ON hm.user_id = t.user_id
     WHERE t.token_hash = $1
       AND (t.expires_at IS NULL OR t.expires_at > now())
     LIMIT 1`,
    [await hashToken(secret)],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    tokenId: row.id,
    userId: row.user_id,
    householdId: row.household_id,
  };
}

/** Record use, at most once a minute so a busy client is not a write storm. */
export async function touchApiToken(
  q: QueryFn,
  tokenId: string,
): Promise<void> {
  await q(
    `UPDATE api_tokens SET last_used_at = now()
     WHERE id = $1
       AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
    [tokenId],
  );
}
