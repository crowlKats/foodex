/**
 * Utilities for working with recipe step dependency graphs.
 */

export interface StepDepEdge {
  step_id: string;
  depends_on: string;
}

/**
 * Convert DB-level step dep edges (UUID-based) into index-based `after` arrays.
 * Returns a Map<stepId, sortedIndices[]>.
 */
export function computeStepAfters(
  stepIds: string[],
  deps: StepDepEdge[],
): Map<string, number[]> {
  const idToIndex = new Map<string, number>();
  stepIds.forEach((id, i) => idToIndex.set(id, i));

  const result = new Map<string, number[]>();
  for (const id of stepIds) result.set(id, []);

  for (const { step_id, depends_on } of deps) {
    const depIdx = idToIndex.get(depends_on);
    if (depIdx != null) {
      result.get(step_id)!.push(depIdx);
    }
  }

  // Sort each step's deps for consistency
  for (const arr of result.values()) arr.sort((a, b) => a - b);

  return result;
}
