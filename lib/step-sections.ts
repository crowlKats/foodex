export interface SectionInfo {
  id: string;
  key: string;
  title: string;
  /** Indices (within the same `sections` array) of sections this depends on. */
  after?: number[];
}

export interface StepWithSection {
  section_id?: string | null;
  title: string;
}

export interface SectionLayout {
  /** Display number for each step (1-based, restarts per section). */
  displayNum: number[];
  /** Anchor id for each step (`step-{key}-{N}` or `step-{N}` if no section). */
  anchors: string[];
  /** Map section id → ordered global step indices in that section. */
  bySectionId: Map<string | null, number[]>;
  byId: Map<string, SectionInfo>;
  byKey: Map<string, SectionInfo>;
}

export function computeSectionLayout(
  steps: StepWithSection[],
  sections: SectionInfo[] | undefined,
): SectionLayout {
  const byId = new Map<string, SectionInfo>();
  const byKey = new Map<string, SectionInfo>();
  if (sections) {
    for (const s of sections) {
      byId.set(s.id, s);
      byKey.set(s.key, s);
    }
  }

  const bySectionId = new Map<string | null, number[]>();
  for (let i = 0; i < steps.length; i++) {
    const sid = steps[i].section_id ?? null;
    if (!bySectionId.has(sid)) bySectionId.set(sid, []);
    bySectionId.get(sid)!.push(i);
  }

  const displayNum: number[] = new Array(steps.length);
  const anchors: string[] = new Array(steps.length);
  for (const [sid, indices] of bySectionId) {
    const sec = sid ? byId.get(sid) : null;
    indices.forEach((idx, n) => {
      displayNum[idx] = n + 1;
      anchors[idx] = sec ? `step-${sec.key}-${n + 1}` : `step-${n + 1}`;
    });
  }

  return { displayNum, anchors, bySectionId, byId, byKey };
}

export interface SectionAnnotation {
  /** Titles of sections this one directly depends on. */
  afterTitles: string[];
  /** Titles of earlier sections that run in parallel with this one. */
  parallelTitles: string[];
}

/**
 * For each section in `sections`, produce a parallel/dependency annotation
 * relative to the other sections in the list. Section indices in `after`
 * point into `sections` itself.
 */
export function computeSectionAnnotations(
  sections: SectionInfo[],
): SectionAnnotation[] {
  const after = sections.map((s) => s.after ?? []);
  const transAfter: Set<number>[] = sections.map(() => new Set<number>());
  for (let i = 0; i < sections.length; i++) {
    const stack = [...after[i]];
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (transAfter[i].has(x)) continue;
      transAfter[i].add(x);
      for (const y of after[x] ?? []) stack.push(y);
    }
  }
  return sections.map((s, i) => {
    const afterTitles = (s.after ?? [])
      .map((d) => sections[d]?.title)
      .filter((t): t is string => !!t);
    const parallelTitles: string[] = [];
    for (let j = 0; j < i; j++) {
      if (transAfter[i].has(j)) continue; // hard dep, not parallel
      if (transAfter[j].has(i)) continue;
      parallelTitles.push(sections[j].title);
    }
    return { afterTitles, parallelTitles };
  });
}
