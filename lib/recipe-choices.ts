// Choices: alternatives the cook picks between ("Cooking method: stovetop or
// oven"). Steps, sections and ingredient rows can belong to one option; under
// a given selection everything tagged with an unpicked option is hidden.
// This module is the pure half: the selection model and the projection that
// drops hidden nodes from index-linked lists.

export interface ChoiceOptionInfo {
  id: string;
  key: string;
  title: string;
}

export interface ChoiceInfo {
  id: string;
  key: string;
  title: string;
  /** What the cook is choosing between, shown with the picker. */
  description?: string | null;
  /** In display order; the first option is the default. */
  options: ChoiceOptionInfo[];
}

/** Picked option id per choice id. */
export type ChoiceSelection = Record<string, string>;

/** The first option of every choice: what the page shows before any pick. */
export function defaultSelection(choices: ChoiceInfo[]): ChoiceSelection {
  const sel: ChoiceSelection = {};
  for (const c of choices) {
    if (c.options.length > 0) sel[c.id] = c.options[0].id;
  }
  return sel;
}

/** Option ids that are not picked under `selection`. */
export function hiddenOptionIds(
  choices: ChoiceInfo[],
  selection: ChoiceSelection,
): Set<string> {
  const hidden = new Set<string>();
  for (const c of choices) {
    const picked = selection[c.id] ?? c.options[0]?.id;
    for (const o of c.options) {
      if (o.id !== picked) hidden.add(o.id);
    }
  }
  return hidden;
}

/** Query-string form of a selection (`choice.<key>=<option key>`), for links. */
export function selectionToParams(
  choices: ChoiceInfo[],
  selection: ChoiceSelection,
  params: URLSearchParams,
): void {
  for (const c of choices) {
    const name = `choice.${c.key}`;
    const picked = c.options.find((o) => o.id === selection[c.id]);
    // The default needs no mention; a link stays short unless it says
    // something.
    if (!picked || picked.id === c.options[0]?.id) params.delete(name);
    else params.set(name, picked.key);
  }
}

/** Read `choice.<key>=<option key>` params back into a selection. */
export function selectionFromParams(
  choices: ChoiceInfo[],
  params: URLSearchParams,
): ChoiceSelection {
  const sel = defaultSelection(choices);
  for (const c of choices) {
    const wanted = params.get(`choice.${c.key}`);
    if (!wanted) continue;
    const opt = c.options.find((o) => o.key === wanted);
    if (opt) sel[c.id] = opt.id;
  }
  return sel;
}

export interface Projection<T> {
  /** The visible nodes, in original order, with `after` re-pointed. */
  nodes: T[];
  /** Original index → new index, or null when the node was hidden. */
  indexMap: (number | null)[];
}

/**
 * Drop hidden nodes from an index-linked list. A visible node that depended
 * on a hidden one inherits that node's own dependencies, so "1 → 2a → 2b → 3"
 * with 2b hidden reads "1 → 2a → 3" and with 2a hidden reads "1 → 2b → 3".
 * Without this a hidden dependency would either block forever or be treated
 * as done, unlocking a step whose real prerequisites are not.
 */
export function projectVisible<T extends { after?: number[] }>(
  nodes: T[],
  hidden: (node: T, index: number) => boolean,
): Projection<T> {
  const isHidden = nodes.map((n, i) => hidden(n, i));
  const indexMap: (number | null)[] = [];
  let next = 0;
  for (let i = 0; i < nodes.length; i++) {
    indexMap.push(isHidden[i] ? null : next++);
  }

  /** Visible dependencies of node `i`: its own, and those reached through
   *  hidden nodes, kept apart so only the inherited ones can be trimmed. */
  function visibleDeps(i: number): { direct: number[]; inherited: number[] } {
    const direct = new Set<number>();
    const inherited = new Set<number>();
    const seen = new Set<number>();
    const stack = (nodes[i].after ?? []).map((d) => ({ d, viaHidden: false }));
    while (stack.length > 0) {
      const { d, viaHidden } = stack.pop()!;
      if (seen.has(d) || d === i) continue;
      seen.add(d);
      if (isHidden[d]) {
        for (const dd of nodes[d].after ?? []) {
          stack.push({ d: dd, viaHidden: true });
        }
      } else if (viaHidden) inherited.add(d);
      else direct.add(d);
    }
    return { direct: [...direct], inherited: [...inherited] };
  }

  const projected: T[] = [];
  const inheritedOf: number[][] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (isHidden[i]) continue;
    const deps = visibleDeps(i);
    const toNew = (list: number[]) =>
      list.map((d) => indexMap[d]).filter((d): d is number => d != null);
    const direct = toNew(deps.direct);
    const inherited = toNew(deps.inherited).filter((d) => !direct.includes(d));
    projected.push({
      ...nodes[i],
      after: [...direct, ...inherited].sort((a, b) => a - b),
    });
    inheritedOf.push(inherited);
  }

  // Passing through a hidden fork member hands its dependencies to the
  // node after the fork, which usually already reaches them through the
  // visible member ("after step 1 and step 2" where step 2 follows step 1).
  // Drop an inherited dependency that another dependency already implies.
  const ancestors = new Map<number, Set<number>>();
  const ancestorsOf = (i: number): Set<number> => {
    const cached = ancestors.get(i);
    if (cached) return cached;
    const out = new Set<number>();
    ancestors.set(i, out);
    for (const d of projected[i].after ?? []) {
      out.add(d);
      for (const a of ancestorsOf(d)) out.add(a);
    }
    return out;
  };
  projected.forEach((node, i) => {
    if (inheritedOf[i].length === 0) return;
    const after = node.after ?? [];
    node.after = after.filter((d) =>
      !inheritedOf[i].includes(d) ||
      !after.some((other) => other !== d && ancestorsOf(other).has(d))
    );
  });
  return { nodes: projected, indexMap };
}

// ── Alternatives → choices ────────────────────────────────────────────
//
// Authors never define a choice directly. In the editor a step (or section)
// forks into either/or siblings that share an `alt` group key; the choice
// rows in the database are derived from those groups at save time, one
// option per member, the first member in order being the default.

export interface AltMember {
  kind: "step" | "section";
  /** Position in its own list (steps or sections), in save order. */
  index: number;
  title: string;
  /** Group key shared by the alternatives of one fork. */
  group: string;
}

export interface DerivedOption {
  key: string;
  title: string;
  member: AltMember;
}

export interface DerivedChoice {
  key: string;
  title: string;
  options: DerivedOption[];
}

/** Fallback label for an untitled alternative, by its position in the fork. */
export function altFallbackTitle(position: number): string {
  return `Option ${String.fromCharCode(65 + (position % 26))}`;
}

function slugKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Group members by their `alt` key. A group with a single member is not a
 * fork and is dropped, so a lone tagged step behaves like an untagged one.
 * Option keys come from the member titles (deduplicated within the fork).
 */
export function deriveChoices(members: AltMember[]): DerivedChoice[] {
  const groups = new Map<string, AltMember[]>();
  for (const m of members) {
    const key = m.group.trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  const out: DerivedChoice[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const used = new Set<string>();
    const options = list.map((m, i) => {
      const title = m.title.trim() || altFallbackTitle(i);
      let optKey = slugKey(title) || `option-${i + 1}`;
      while (used.has(optKey)) optKey = `${optKey}-${i + 1}`;
      used.add(optKey);
      return { key: optKey, title, member: m };
    });
    out.push({ key, title: key, options });
  }
  return out;
}

// ── Branches ──────────────────────────────────────────────────────────
//
// A fork's members are single nodes, but each alternative may go on for a
// while before the paths rejoin: A, A2, A3 on one side and B, B2 on the
// other, both into C. The graph already says which is which: a node
// reachable from A but from no other member of A's fork belongs to A's
// branch. Reachability follows every path, so a node the branches share
// (C) is never claimed.

export interface BranchNode {
  after?: number[];
  alt?: string | null;
  /** Nodes fork only within one scope (a step's section). */
  scope?: string | number | null;
}

/**
 * Branch membership: node index → the fork member it follows. Members map
 * to themselves. Nodes shared by several branches, and forks with a single
 * member, are absent.
 */
export function deriveBranches(nodes: BranchNode[]): Map<number, number> {
  // Forks: members grouped by scope and alt key.
  const forks = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (!n.alt) return;
    const key = `${n.scope ?? ""} ${n.alt}`;
    const list = forks.get(key) ?? [];
    list.push(i);
    forks.set(key, list);
  });

  // Dependents (forward edges), for walking downstream from a member.
  const dependents: number[][] = nodes.map(() => []);
  nodes.forEach((n, i) => {
    for (const d of n.after ?? []) {
      if (d >= 0 && d < nodes.length) dependents[d].push(i);
    }
  });
  const downstream = (start: number): Set<number> => {
    const seen = new Set<number>();
    const stack = [...dependents[start]];
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...dependents[x]);
    }
    return seen;
  };

  const out = new Map<number, number>();
  for (const members of forks.values()) {
    if (members.length < 2) continue;
    const reach = members.map(downstream);
    members.forEach((m, mi) => {
      out.set(m, m);
      for (const x of reach[mi]) {
        if (members.includes(x) || out.has(x)) continue;
        const shared = reach.some((r, ri) => ri !== mi && r.has(x));
        if (!shared) out.set(x, m);
      }
    });
  }
  return out;
}
