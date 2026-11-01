import { assertEquals } from "@std/assert";
import { base64url } from "./api-tokens.ts";
import { verifyClientAssertion } from "./oauth-client-auth.ts";

const CLIENT_ID = "https://app.example/oauth/client.json";
const ORIGIN = "https://foodex.example";
const AUDIENCES = [`${ORIGIN}/oauth/token`, ORIGIN];
const NOW = 1_800_000_000;

const SIGN_PARAMS: Record<
  string,
  AlgorithmIdentifier | RsaPssParams | EcdsaParams
> = {
  RS256: { name: "RSASSA-PKCS1-v1_5" },
  PS256: { name: "RSA-PSS", saltLength: 32 } as RsaPssParams,
  ES256: { name: "ECDSA", hash: "SHA-256" } as EcdsaParams,
  EdDSA: { name: "Ed25519" },
};

async function sign(
  claims: Record<string, unknown>,
  key: CryptoKey,
  header: Record<string, unknown>,
): Promise<string> {
  const enc = (v: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(v)));
  const head = `${enc({ typ: "JWT", ...header })}.${enc(claims)}`;
  const sig = await crypto.subtle.sign(
    SIGN_PARAMS[header.alg as string],
    key,
    new TextEncoder().encode(head),
  );
  return `${head}.${base64url(new Uint8Array(sig))}`;
}

async function rsaKey(kid: string) {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    privateKey: pair.privateKey,
    jwk: { ...jwk, kid, use: "sig", alg: "RS256" },
  };
}

let jtiCounter = 0;
function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: CLIENT_ID,
    sub: CLIENT_ID,
    aud: `${ORIGIN}/oauth/token`,
    exp: NOW + 300,
    iat: NOW,
    jti: `jti-${++jtiCounter}`,
    ...overrides,
  };
}

const rsa = await rsaKey("k1");
const check = (keys: JsonWebKey[] = [rsa.jwk]) => ({
  clientId: CLIENT_ID,
  audiences: AUDIENCES,
  getKeys: () => Promise.resolve(keys),
  now: NOW,
});

Deno.test("a well-formed RS256 assertion verifies, once", async () => {
  const jwt = await sign(claims(), rsa.privateKey, { alg: "RS256", kid: "k1" });
  assertEquals(await verifyClientAssertion(jwt, check()), null);
  assertEquals(
    await verifyClientAssertion(jwt, check()),
    "assertion was already used",
  );
});

Deno.test("the issuer works as an audience too, and aud may be a list", async () => {
  for (const aud of [ORIGIN, ["https://other.example", ORIGIN]]) {
    const jwt = await sign(claims({ aud }), rsa.privateKey, { alg: "RS256" });
    assertEquals(await verifyClientAssertion(jwt, check()), null);
  }
});

Deno.test("ES256 and EdDSA keys verify", async () => {
  const cases: [string, EcKeyGenParams | Algorithm][] = [
    ["ES256", { name: "ECDSA", namedCurve: "P-256" }],
    ["EdDSA", { name: "Ed25519" }],
  ];
  for (const [alg, params] of cases) {
    const pair = await crypto.subtle.generateKey(params, true, [
      "sign",
      "verify",
    ]) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const jwt = await sign(claims(), pair.privateKey, { alg });
    assertEquals(await verifyClientAssertion(jwt, check([jwk])), null, alg);
  }
});

Deno.test("bad claims are refused", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [
      { iss: "https://evil.example/c" },
      "assertion iss and sub must be the client_id",
    ],
    [{ sub: "someone" }, "assertion iss and sub must be the client_id"],
    [
      { aud: "https://other.example/token" },
      "assertion aud is not this server",
    ],
    [{ exp: NOW - 120 }, "assertion has expired"],
    [{ exp: undefined }, "assertion has expired"],
    [{ exp: NOW + 7200 }, "assertion lives too long"],
    [{ nbf: NOW + 600 }, "assertion is not valid yet"],
    [{ jti: undefined }, "assertion has no jti"],
  ];
  for (const [overrides, reason] of cases) {
    const jwt = await sign(claims(overrides), rsa.privateKey, { alg: "RS256" });
    assertEquals(await verifyClientAssertion(jwt, check()), reason);
  }
});

Deno.test("signatures and algorithms are checked", async () => {
  const other = await rsaKey("k1");
  const forged = await sign(claims(), other.privateKey, { alg: "RS256" });
  assertEquals(
    await verifyClientAssertion(forged, check()),
    "assertion signature is invalid",
  );

  const [head, body] = (await sign(claims(), rsa.privateKey, { alg: "RS256" }))
    .split(".");
  const none = `${
    base64url(new TextEncoder().encode('{"alg":"none"}'))
  }.${body}.`;
  assertEquals(
    await verifyClientAssertion(none, check()),
    "assertion alg none is not supported",
  );
  const hs = `${
    base64url(new TextEncoder().encode('{"alg":"HS256"}'))
  }.${body}.${head}`;
  assertEquals(
    await verifyClientAssertion(hs, check()),
    "assertion alg HS256 is not supported",
  );
  assertEquals(
    await verifyClientAssertion("not.a.jwt", check()),
    "assertion is not a JWT",
  );
});

Deno.test("an unknown kid refetches the keys once", async () => {
  const rotated = await rsaKey("k2");
  const refreshes: boolean[] = [];
  const jwt = await sign(claims(), rotated.privateKey, {
    alg: "RS256",
    kid: "k2",
  });
  const result = await verifyClientAssertion(jwt, {
    ...check(),
    getKeys: (refresh) => {
      refreshes.push(refresh);
      return Promise.resolve(refresh ? [rsa.jwk, rotated.jwk] : [rsa.jwk]);
    },
  });
  assertEquals(result, null);
  assertEquals(refreshes, [false, true]);

  const missing = await sign(claims(), rotated.privateKey, {
    alg: "RS256",
    kid: "k3",
  });
  assertEquals(
    await verifyClientAssertion(missing, check()),
    "no matching key in the client's JWKS",
  );
});
