/**
 * Simple in-memory sliding-window rate limiter keyed by user ID.
 */

interface Entry {
  timestamps: number[];
}

const buckets = new Map<string, Entry>();

// Periodic cleanup of stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (
      entry.timestamps.length === 0 ||
      entry.timestamps[entry.timestamps.length - 1] < now - 600_000
    ) {
      buckets.delete(key);
    }
  }
}, 300_000);

/**
 * Check whether a request should be allowed.
 * @param key   Unique key (e.g. `"ai:${userId}"`)
 * @param limit Max requests allowed in the window
 * @param windowMs Window size in milliseconds
 * @returns `true` if the request is allowed, `false` if rate-limited
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  // Remove timestamps outside the window
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}
