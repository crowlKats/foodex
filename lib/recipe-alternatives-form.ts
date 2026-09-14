// Shared editor vocabulary for alternatives: the step editor publishes the
// alternatives it currently holds, the ingredient editor offers them as
// "needed for" targets. Kept out of the islands so both can import it.

export interface AltRef {
  kind: "step" | "section";
  /** The editor-side identity of the step or section (`_uid`). */
  uid: string;
  /** What to call it in a picker. */
  label: string;
  /** Group key of the fork it belongs to. */
  group: string;
  /** Index the step editor serializes it under (`steps[i]` / `sections[i]`). */
  formIndex: number;
}

/** A fresh, recipe-unique alt group key. */
export function newAltGroup(
  existing: Iterable<string | null | undefined>,
): string {
  const used = new Set([...existing].filter((g): g is string => !!g));
  let n = 1;
  while (used.has(`alt-${n}`)) n++;
  return `alt-${n}`;
}
