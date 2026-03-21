const GITHUB_CLIENT_ID = Deno.env.get("GITHUB_CLIENT_ID") ?? "";
const GITHUB_CLIENT_SECRET = Deno.env.get("GITHUB_CLIENT_SECRET") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

function getBaseUrl(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
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
): Promise<{ githubId: string; email: string | null; name: string; avatarUrl: string }> {
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
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error("Failed to get GitHub access token");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = await userRes.json();

  let email = user.email;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
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
): Promise<{ googleId: string; email: string | null; name: string; avatarUrl: string }> {
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
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new Error("Failed to get Google access token");

  const userRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const user = await userRes.json();

  return {
    googleId: String(user.id),
    email: user.email ?? null,
    name: user.name ?? user.email ?? "User",
    avatarUrl: user.picture ?? "",
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
