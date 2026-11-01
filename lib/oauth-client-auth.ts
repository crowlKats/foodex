// private_key_jwt client authentication (RFC 7523): the client signs a
// short-lived JWT with its own key and sends it to the token endpoint as
// client_assertion. The public half comes from the client's metadata
// document, so a client like ChatGPT proves it is the one behind its
// client_id without any secret shared with Foodex.

export const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/** Signature algorithms accepted on a client assertion. */
export const CLIENT_ASSERTION_ALGS = ["RS256", "PS256", "ES256", "EdDSA"];

/** Slack for clocks that disagree a little. */
const CLOCK_SKEW_SECONDS = 60;
/** An assertion is meant for one request; refuse long-lived ones. */
const MAX_LIFETIME_SECONDS = 60 * 60;

const ALGORITHMS: Record<
  string,
  {
    kty: string;
    importParams: RsaHashedImportParams | EcKeyImportParams | Algorithm;
    verifyParams: Algorithm | RsaPssParams | EcdsaParams;
  }
> = {
  RS256: {
    kty: "RSA",
    importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    verifyParams: { name: "RSASSA-PKCS1-v1_5" },
  },
  PS256: {
    kty: "RSA",
    importParams: { name: "RSA-PSS", hash: "SHA-256" },
    verifyParams: { name: "RSA-PSS", saltLength: 32 } as RsaPssParams,
  },
  ES256: {
    kty: "EC",
    importParams: { name: "ECDSA", namedCurve: "P-256" },
    verifyParams: { name: "ECDSA", hash: "SHA-256" } as EcdsaParams,
  },
  EdDSA: {
    kty: "OKP",
    importParams: { name: "Ed25519" },
    verifyParams: { name: "Ed25519" },
  },
};

/**
 * Assertion ids seen recently, so a captured assertion can't be replayed
 * while it is still valid. In memory, like the rate limiter: Foodex runs
 * as a single process.
 */
const seenJtis = new Map<string, number>();

function rememberJti(key: string, exp: number, now: number): boolean {
  for (const [k, e] of seenJtis) if (e < now) seenJtis.delete(k);
  if (seenJtis.has(key)) return false;
  seenJtis.set(key, exp + CLOCK_SKEW_SECONDS);
  return true;
}

export interface AssertionCheck {
  clientId: string;
  /** Acceptable audiences: the token endpoint URL and the issuer. */
  audiences: string[];
  /** The client's public keys; `refresh` asks for a fresh copy. */
  getKeys: (refresh: boolean) => Promise<JsonWebKey[]>;
  /** Seconds since the epoch, for tests. */
  now?: number;
}

function decodeBytes(segment: string): Uint8Array<ArrayBuffer> {
  const b64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBytes(segment)));
}

/**
 * Verify a client assertion. Returns null when it checks out, or the
 * reason it doesn't.
 */
export async function verifyClientAssertion(
  assertion: string,
  check: AssertionCheck,
): Promise<string | null> {
  const parts = assertion.split(".");
  if (parts.length !== 3) return "assertion is not a JWT";
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    header = decodeSegment(parts[0]) as Record<string, unknown>;
    claims = decodeSegment(parts[1]) as Record<string, unknown>;
    signature = decodeBytes(parts[2]);
  } catch {
    return "assertion is not a JWT";
  }
  if (typeof header !== "object" || header === null) {
    return "assertion is not a JWT";
  }
  if (typeof claims !== "object" || claims === null) {
    return "assertion is not a JWT";
  }

  const alg = typeof header.alg === "string" ? header.alg : "";
  const algorithm = ALGORITHMS[alg];
  if (!algorithm) return `assertion alg ${alg || "(none)"} is not supported`;
  const kid = typeof header.kid === "string" ? header.kid : null;

  const now = check.now ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== check.clientId || claims.sub !== check.clientId) {
    return "assertion iss and sub must be the client_id";
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((a) => check.audiences.includes(a as string))) {
    return "assertion aud is not this server";
  }
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) {
    return "assertion has expired";
  }
  if (claims.exp - now > MAX_LIFETIME_SECONDS) {
    return "assertion lives too long";
  }
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_SECONDS > now) {
    return "assertion is not valid yet";
  }
  if (typeof claims.jti !== "string" || !claims.jti) {
    return "assertion has no jti";
  }

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const candidates = (keys: JsonWebKey[]) =>
    keys.filter((k) =>
      k.kty === algorithm.kty &&
      (k as { use?: string }).use !== "enc" &&
      (!k.alg || k.alg === alg) &&
      (!kid || (k as { kid?: string }).kid === kid)
    );
  let keys = candidates(await check.getKeys(false));
  // A kid we don't know yet usually means the client rotated its keys.
  if (keys.length === 0) keys = candidates(await check.getKeys(true));
  if (keys.length === 0) return "no matching key in the client's JWKS";

  let verified = false;
  for (const jwk of keys) {
    try {
      // Only the key material: use, key_ops and alg could clash with the
      // usage asked for here, and were checked above.
      const { use: _u, key_ops: _o, alg: _a, ...material } = jwk as
        & JsonWebKey
        & { use?: string };
      const key = await crypto.subtle.importKey(
        "jwk",
        material,
        algorithm.importParams,
        false,
        ["verify"],
      );
      if (
        await crypto.subtle.verify(algorithm.verifyParams, key, signature, data)
      ) {
        verified = true;
        break;
      }
    } catch {
      // Malformed key; try the next.
    }
  }
  if (!verified) return "assertion signature is invalid";

  if (!rememberJti(`${check.clientId} ${claims.jti}`, claims.exp, now)) {
    return "assertion was already used";
  }
  return null;
}
