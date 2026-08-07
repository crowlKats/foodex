// Web-access tool helpers. SSRF-guarded: only public http(s) hosts; loopback,
// private, link-local and cloud-metadata addresses are rejected. Hostnames that
// aren't IP literals are allowed (DNS-rebinding is not defended against here, a
// known v1 limitation; the fetches carry no credentials and are read-only).

const MAX_CHARS = 20_000;

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true; // private / loopback / this-host
  if (a === 169 && b === 254) return true; // link-local + metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  return false;
}

export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("fc") || host.startsWith("fd") || // fc00::/7 (rough)
    isPrivateIpv4(host)
  ) {
    throw new Error("Refusing to fetch a private/loopback address");
  }
  return url;
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
};

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CHARS), truncated: true };
}

/** Raw fetch of a public URL; returns truncated body text. */
export async function fetchRaw(
  raw: string,
): Promise<
  { status: number; content_type: string; text: string; truncated: boolean }
> {
  const url = assertPublicUrl(raw);
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  const body = await res.text();
  const { text, truncated } = truncate(body);
  return {
    status: res.status,
    content_type: res.headers.get("content-type") ?? "",
    text,
    truncated,
  };
}

function jinaHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = Deno.env.get("JINA_API_KEY");
  return { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra };
}

/** Web search via Jina s.jina.ai. Returns a readable results digest. */
export async function jinaSearch(
  query: string,
): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
    headers: jinaHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  }
  return truncate(await res.text());
}

/** Readable page summary via Jina r.jina.ai (markdown). */
export async function jinaSummary(
  raw: string,
): Promise<{ text: string; truncated: boolean }> {
  const url = assertPublicUrl(raw);
  const res = await fetch(`https://r.jina.ai/${url.href}`, {
    headers: jinaHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Summary failed: ${res.status} ${res.statusText}`);
  }
  return truncate(await res.text());
}
