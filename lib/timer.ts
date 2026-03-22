/** Parse a duration string like "15m", "1h30m", "90s", "1h" into total seconds. */
export function parseDuration(input: string): number | null {
  const match = input
    .trim()
    .match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

/** Format total seconds into a human-readable string like "1h 30m" or "15:00". */
export function formatTimer(totalSeconds: number): string {
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format seconds into a short label like "15 min", "1h 30m", "30s". */
export function formatDurationLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m} min`);
  if (s > 0 && h === 0 && m === 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

/** Regex to match @timer(duration) in step text. */
export const TIMER_PATTERN = /@timer\((\d+[hms](?:\d+[hms])*)\)/g;

/** Replace @timer(…) with an HTML button element. */
export function replaceTimers(text: string): string {
  return text.replace(TIMER_PATTERN, (_match, duration: string) => {
    const seconds = parseDuration(duration);
    if (seconds == null) return _match;
    const label = formatDurationLabel(seconds);
    return `<button type="button" class="recipe-timer-btn" data-seconds="${seconds}" data-label="${label}">&#9202; ${label}</button>`;
  });
}
