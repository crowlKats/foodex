// In-process per-session turn lock. A session may have only one in-flight turn;
// while a turn runs, the staging panel is read-only (user edits are rejected).
// Single-instance only — acceptable for v1; a DB advisory lock could harden it.

const active = new Set<string>();

export function acquireTurn(sessionId: string): boolean {
  if (active.has(sessionId)) return false;
  active.add(sessionId);
  return true;
}

export function releaseTurn(sessionId: string): void {
  active.delete(sessionId);
}

export function isTurnActive(sessionId: string): boolean {
  return active.has(sessionId);
}
