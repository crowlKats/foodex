const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ??
  "mailto:foodex@kettmeir.dev";

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: { title: string; body: string; url?: string },
): Promise<boolean> {
  try {
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await encryptPayload(
      subscription.keys.p256dh,
      subscription.keys.auth,
      payloadBytes,
    );

    const endpoint = new URL(subscription.endpoint);
    const vapidHeaders = await createVapidHeaders(
      endpoint.origin,
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
    );

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        Authorization: vapidHeaders.authorization,
        ...vapidHeaders.crypto,
      },
      body: encrypted,
    });

    if (res.status === 201 || res.status === 200) return true;
    if (res.status === 404 || res.status === 410) return false;

    console.error("Push failed:", res.status, await res.text());
    return false;
  } catch (err) {
    console.error("Push notification failed:", err);
    return false;
  }
}

// --- VAPID ---

async function createVapidHeaders(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string,
): Promise<{ authorization: string; crypto: Record<string, string> }> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const claims = { aud: audience, exp: now + 86400, sub: subject };

  const headerB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(header)),
  );
  const claimsB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(claims)),
  );
  const unsigned = `${headerB64}.${claimsB64}`;

  const privKeyBytes = b64urlDecode(privateKey);
  const pubKeyBytes = b64urlDecode(publicKey);

  // Import private key as JWK for P-256
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(pubKeyBytes.slice(1, 33)),
    y: b64urlEncode(pubKeyBytes.slice(33, 65)),
    d: b64urlEncode(privKeyBytes),
  };

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(unsigned),
    ),
  );

  const token = `${unsigned}.${b64urlEncode(sig)}`;
  return {
    authorization: `vapid t=${token}, k=${publicKey}`,
    crypto: {},
  };
}

// --- Payload encryption (RFC 8291 / aes128gcm) ---

async function encryptPayload(
  p256dhB64: string,
  authB64: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const clientPublicKey = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);

  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;

  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey),
  );

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      localKeyPair.privateKey,
      256,
    ),
  );

  // HKDF to derive the encryption key and nonce
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    buildInfo("WebPush: info\0", clientPublicKey, localPublicKeyRaw),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const contentKey = await hkdf(
    salt,
    ikm,
    buildCEKInfo("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    buildCEKInfo("Content-Encoding: nonce\0"),
    12,
  );

  // Pad plaintext (add delimiter byte 0x02 + zero padding)
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext);
  padded[plaintext.length] = 2; // delimiter

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      padded,
    ),
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const recordSize = padded.length + 16; // ciphertext includes 16-byte tag
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);

  const result = new Uint8Array(header.length + ciphertext.length);
  result.set(header);
  result.set(ciphertext, header.length);
  return result;
}

function buildInfo(
  prefix: string,
  clientPublicKey: Uint8Array,
  serverPublicKey: Uint8Array,
): Uint8Array {
  const prefixBytes = new TextEncoder().encode(prefix);
  const info = new Uint8Array(
    prefixBytes.length + 2 + clientPublicKey.length + 2 +
      serverPublicKey.length,
  );
  let offset = 0;
  info.set(prefixBytes, offset);
  offset += prefixBytes.length;
  new DataView(info.buffer).setUint16(offset, clientPublicKey.length, false);
  offset += 2;
  info.set(clientPublicKey, offset);
  offset += clientPublicKey.length;
  new DataView(info.buffer).setUint16(offset, serverPublicKey.length, false);
  offset += 2;
  info.set(serverPublicKey, offset);
  return info;
}

function buildCEKInfo(label: string): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);
  const info = new Uint8Array(labelBytes.length + 1);
  info.set(labelBytes);
  info[labelBytes.length] = 1;
  return info;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    salt.length ? salt : new Uint8Array(32),
    "HKDF",
    false,
    ["deriveBits"],
  );
  // HKDF expects the IKM as the base key — re-derive via extract step
  const prkKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // Actually use the proper HKDF primitive
  const extractKey = await crypto.subtle.importKey(
    "raw",
    salt.length ? salt : new Uint8Array(32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prk = new Uint8Array(
    await crypto.subtle.sign("HMAC", extractKey, ikm),
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    prk,
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
      hkdfKey,
      length * 8,
    ),
  );
}

// --- Base64url helpers ---

function b64urlEncode(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
