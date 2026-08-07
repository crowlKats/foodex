const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID") ?? "";
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const AUTHENTIK_CLIENT_ID = Deno.env.get("AUTHENTIK_CLIENT_ID") ?? "";
const AUTHENTIK_CLIENT_SECRET = Deno.env.get("AUTHENTIK_CLIENT_SECRET") ?? "";
const AUTHENTIK_ISSUER = Deno.env.get("AUTHENTIK_ISSUER") ?? "";
const ALWAYS_HTTPS = Deno.env.get("ALWAYS_HTTPS") === "true";
export const HCAPTCHA_SITEKEY = Deno.env.get("HCAPTCHA_SITEKEY") ?? "";
const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET") ?? "";

// Both halves are required: without the secret we cannot verify a token, and
// without the sitekey the widget never renders, so a token can never be
// produced. Only enforce the captcha when we can actually check it.
export const captchaEnabled = !!(HCAPTCHA_SITEKEY && HCAPTCHA_SECRET);

export const providers = {
  github: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  google: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  authentik: !!(AUTHENTIK_CLIENT_ID && AUTHENTIK_CLIENT_SECRET &&
    AUTHENTIK_ISSUER),
};

/**
 * Invite-only mode: accounts can't create households themselves, so anyone
 * new needs an invite — from an admin (which seeds a fresh household they'll
 * own) or from an existing household. Signing in stays open; without a
 * household an account can't touch anything household-scoped.
 */
export const inviteOnly = Deno.env.get("INVITE_ONLY") === "true";

export async function verifyHCaptcha(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  if (!captchaEnabled) return true;
  if (!token) return false;

  const body = new URLSearchParams({
    secret: HCAPTCHA_SECRET,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("hCaptcha verification failed:", err);
    return false;
  }
}

/**
 * Validate a post-sign-in destination.
 *
 * The destination rides in on a query string, so it is attacker-controlled:
 * only same-origin paths may come back out. `//evil.com` and `/\evil.com` are
 * protocol-relative URLs a browser resolves off-site, control characters would
 * let a `Location` header be split, and an `/auth` destination would bounce the
 * user straight back into the flow they just finished.
 */
export function sanitizeRedirect(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.startsWith("/auth")) return null;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return value;
}

/**
 * Sign-in URL that comes back to `redirectTo` once the user has an account.
 * Use this instead of a bare "/auth/login" whenever the visitor was reaching
 * for something specific (an invite, a shared collection) so signing in
 * doesn't strand them on the default landing page.
 */
export function loginUrl(redirectTo: string): string {
  return `/auth/login?redirect=${encodeURIComponent(redirectTo)}`;
}

/**
 * Household onboarding, likewise returning to `redirectTo` afterwards. A
 * brand-new account has no household, so this step sits between sign-in and
 * anything household-scoped.
 */
export function householdSetupUrl(redirectTo: string): string {
  return `/households?redirect=${encodeURIComponent(redirectTo)}`;
}

/**
 * What a signed-in user without a household gets instead of the page or API
 * endpoint they asked for. Returns null when the request may proceed.
 *
 * Membership is the authorization boundary for the whole app, so this is
 * enforced once in the middleware rather than re-checked route by route:
 * a handler that only checks `state.user` (favorites, substitutions, the
 * agent) must still be unreachable without a household.
 *
 * Three kinds of requests stay open:
 * - the auth flow, household onboarding, and the moving box (which exists
 *   precisely for the stretch between households), or nobody could ever
 *   join or create one;
 * - API endpoints whose authorization comes from something other than
 *   membership: the share-token shopping list, and the public media files
 *   shared pages embed;
 * - framework assets under /_fresh.
 *
 * Pages bounce through onboarding with their destination preserved. A shared
 * link is usually what brought a new account here in the first place, and it
 * is lost for good if the detour forgets it. API calls can't follow that
 * detour, so they get a 403 that `apiErrorMessage` can surface.
 */
export function householdRequirementResponse(url: URL): Response | null {
  const path = url.pathname;

  if (path.startsWith("/api")) {
    if (
      path === "/api/shopping-list-shared" ||
      path.startsWith("/api/media/file/")
    ) {
      return null;
    }
    return Response.json(
      { error: "Join or create a household to do this." },
      { status: 403 },
    );
  }

  if (
    path.startsWith("/auth") ||
    path.startsWith("/households") ||
    path === "/moving-box" ||
    path.startsWith("/_fresh")
  ) {
    return null;
  }

  const target = sanitizeRedirect(path + url.search);
  return new Response(null, {
    status: 303,
    headers: { Location: target ? householdSetupUrl(target) : "/households" },
  });
}

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${ALWAYS_HTTPS ? "https:" : url.protocol}//${url.host}`;
}

export function generateInviteCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createOAuthStateCookie(state: string): string {
  return `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`;
}

export function clearOAuthStateCookie(): string {
  return "oauth_state=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0";
}

export function getOAuthStateFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)oauth_state=([^;]+)/);
  return match ? match[1] : null;
}

// The provider round-trip can't carry our own destination (`state` is spent on
// CSRF), so it rides along in a cookie with the same lifetime.
export function createOAuthRedirectCookie(path: string): string {
  return `oauth_redirect=${
    encodeURIComponent(path)
  }; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`;
}

export function clearOAuthRedirectCookie(): string {
  return "oauth_redirect=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0";
}

export function getOAuthRedirectFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)oauth_redirect=([^;]+)/);
  if (!match) return null;
  try {
    return sanitizeRedirect(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function getGitHubAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/auth/callback/github`,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGitHubCode(
  req: Request,
  code: string,
): Promise<
  { githubId: string; email: string | null; name: string; avatarUrl: string }
> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${getBaseUrl(req)}/auth/callback/github`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error("Failed to get GitHub access token");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const user = await userRes.json();

  let email = user.email;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const emails = await emailsRes.json();
    const primary = emails.find(
      (e: { primary: boolean; verified: boolean }) => e.primary && e.verified,
    );
    email = primary?.email ?? null;
  }

  return {
    githubId: String(user.id),
    email,
    name: user.name || user.login,
    avatarUrl: user.avatar_url,
  };
}

export function getGoogleAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  req: Request,
  code: string,
): Promise<
  { googleId: string; email: string | null; name: string; avatarUrl: string }
> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${getBaseUrl(req)}/auth/callback/google`,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error("Failed to get Google access token");

  const userRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const user = await userRes.json();

  return {
    googleId: String(user.id),
    email: user.email ?? null,
    name: user.name ?? user.email ?? "User",
    avatarUrl: user.picture ?? "",
  };
}

export function getAuthentikAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: AUTHENTIK_CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/auth/callback/authentik`,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return `${AUTHENTIK_ISSUER}/authorize/?${params}`;
}

export async function exchangeAuthentikCode(
  req: Request,
  code: string,
): Promise<
  {
    authentikId: string;
    email: string | null;
    name: string;
    avatarUrl: string;
  }
> {
  const tokenRes = await fetch(`${AUTHENTIK_ISSUER}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: AUTHENTIK_CLIENT_ID,
      client_secret: AUTHENTIK_CLIENT_SECRET,
      redirect_uri: `${getBaseUrl(req)}/auth/callback/authentik`,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error("Failed to get Authentik access token");

  const userRes = await fetch(`${AUTHENTIK_ISSUER}/userinfo/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const user = await userRes.json();

  return {
    authentikId: String(user.sub),
    email: user.email ?? null,
    name: user.name ?? user.preferred_username ?? user.email ?? "User",
    avatarUrl: "",
  };
}

export function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export function createSessionCookie(sessionId: string): string {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return "session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0";
}

export function getSessionIdFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}
