/**
 * Step graph layout utilities for view mode.
 * Computes per-step annotations describing dependency relationships.
 */

export interface StepWithColumn {
  column?: number;
  after?: number[];
}

export interface StepAnnotation {
  index: number;
  annotation: string | null;
}

export function computeStepAnnotations(
  steps: StepWithColumn[],
  stepLabel: (index: number) => string,
): StepAnnotation[] {
  const result: StepAnnotation[] = [];

  for (let i = 0; i < steps.length; i++) {
    const after = steps[i].after ?? [];

    if (i === 0 || after.length === 0) {
      result.push({ index: i, annotation: null });
      continue;
    }

    if (after.length === 1 && after[0] === i - 1) {
      result.push({ index: i, annotation: null });
      continue;
    }

    if (after.length === 1 && after[0] < i - 1) {
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
