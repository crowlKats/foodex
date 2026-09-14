// Personal API tokens: bearer credentials for programs acting as a user
// (the MCP endpoint). The secret is shown once; only its hash is stored.

import type { QueryFn } from "../db/mod.ts";

/** The prefix every token starts with, so a leaked one is recognizable. */
const TOKEN_PREFIX = "fx_";
/** Characters of the secret kept in clear for the list on the profile. */
const SHOWN_CHARS = 8;

export interface ApiTokenInfo {
  id: string;
  name: string;
  /** Enough of the secret to tell tokens apart: `fx_ab12cd34`. */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenPrincipal {
  tokenId: string;
  userId: string;
  householdId: string | null;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hashToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mint a token for a user. Returns the secret, which is not stored. */
export async function createApiToken(
  q: QueryFn,
  userId: string,
  name: string,
): Promise<{ id: string; secret: string }> {
  const secret = TOKEN_PREFIX +
    base64url(crypto.getRandomValues(new Uint8Array(32)));
  const res = await q<{ id: string }>(
    `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      userId,
      name,
      await hashToken(secret),
      secret.slice(0, TOKEN_PREFIX.length + SHOWN_CHARS),
    ],
  );
  return { id: res.rows[0].id, secret };
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
  }>(
    `SELECT id, name, token_prefix, created_at, last_used_at
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
