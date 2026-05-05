/**
 * Step graph layout utilities for view mode.
 * Computes per-step annotations describing dependency relationships.
 */

export interface StepWithDeps {
  after?: number[];
  section_id?: string | null;
}

export interface StepAnnotation {
  index: number;
  annotation: string | null;
}

/**
 * For each step, return an annotation describing its non-linear deps within
 * its own group (same section, or all loose steps). A step that depends on
 * the previous step in its group is "linear" → no annotation. Anything else
 * gets "while waiting for X" or "after X and Y".
 *
 * `getGroup(i)` returns the ordered list of step indices that share a group
 * with step `i` (always including `i` itself). Defaults to "all steps".
 */
export function computeStepAnnotations(
  steps: StepWithDeps[],
  stepLabel: (index: number) => string,
  getGroup?: (i: number) => number[],
): StepAnnotation[] {
  const result: StepAnnotation[] = [];

  for (let i = 0; i < steps.length; i++) {
    const after = steps[i].after ?? [];
    const group = getGroup ? getGroup(i) : steps.map((_, j) => j);
    const posInGroup = group.indexOf(i);
    const prevInGroup = posInGroup > 0 ? group[posInGroup - 1] : null;

    if (posInGroup === 0 || after.length === 0) {
      result.push({ index: i, annotation: null });
      continue;
    }

    if (after.length === 1 && after[0] === prevInGroup) {
      // Linear within group
      result.push({ index: i, annotation: null });
      continue;
    }

    if (after.length === 1) {
      result.push({
        index: i,
        annotation: `while waiting for ${stepLabel(after[0])}`,
      });
      continue;
    }

    if (after.length > 1) {
      const labels = after.map((d) => stepLabel(d));
      result.push({
        index: i,
        annotation: `after ${labels.join(" and ")}`,
      });
      continue;
    }

    result.push({ index: i, annotation: null });
  }

  return result;
}
