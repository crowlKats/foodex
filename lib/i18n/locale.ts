/**
 * Locale negotiation for UI chrome.
 *
 * Logged-in UI uses the language stored on the user. Logged-out (and users
 * whose stored tag we don't ship a catalog for) fall back through
 * Accept-Language, then English.
 */

export const DEFAULT_LOCALE = "en";

/** Catalogs we ship. BCP 47 tags, primary subtag only. */
export const SUPPORTED_LOCALES = ["en", "it"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Reduce a BCP 47 tag (`it-IT`, `en`) to a catalog we ship, or null if none
 * match. Matching is on the primary subtag so `it-IT` selects Italian.
 */
export function matchSupported(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.trim().split("-")[0]?.toLowerCase();
  if (primary && isLocale(primary)) return primary;
  return null;
}

/**
 * Parse an Accept-Language header into tags ordered by quality, highest first.
 */
export function parseAcceptLanguage(
  header: string | null | undefined,
): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      let q = 1;
      for (const param of params) {
        const [k, v] = param.trim().split("=");
        if (k === "q" && v) {
          const n = Number(v);
          if (!Number.isNaN(n)) q = n;
        }
      }
      return { tag: tag.trim(), q };
    })
    .filter((p) => p.tag && p.tag !== "*" && p.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((p) => p.tag);
}

/**
 * Pick a shipped catalog locale.
 *
 * `userLanguage` wins when it matches a catalog. Otherwise the first
 * Accept-Language tag we ship, then English.
 */
export function negotiateLocale(
  userLanguage?: string | null,
  acceptLanguage?: string | null,
): Locale {
  const fromUser = matchSupported(userLanguage);
  if (fromUser) return fromUser;
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    const matched = matchSupported(tag);
    if (matched) return matched;
  }
  return DEFAULT_LOCALE;
}

/** Logged-out / first-signup locale from the request's Accept-Language. */
export function localeFromRequest(req: Request): Locale {
  return negotiateLocale(null, req.headers.get("accept-language"));
}
