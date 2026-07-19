// `updated_at` comes back from node-postgres as a JS Date on a fresh read but as
// an ISO string after a JSONB round-trip (observations stored in the event log).
// Normalizing every version token to an ISO string makes the read-before-write
// comparison stable across both — otherwise `Date !== Date` (by reference) makes
// edit_recipe / edit_ingredient always report a false conflict.
export function isoVersion(v: unknown): string {
  const d = new Date(v as string | number | Date);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}
