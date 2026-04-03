/**
 * Utilities for working with recipe step dependency graphs.
 * Steps form a DAG; each step's "column" is its longest-path depth from a root.
 */

export interface StepDepEdge {
  step_id: string;
  depends_on: string;
}

/**
 * Compute a column (phase) index for each step based on dependency edges.
 * Steps with no dependencies get column 0.
 * A step's column = 1 + max(column of each dependency).
 * Returns a Map<stepId, columnIndex>.
 */
export function computeStepColumns(
  stepIds: string[],
  deps: StepDepEdge[],
): Map<string, number> {
  if (deps.length === 0) {
    // All steps in column 0 (linear/single-phase)
    return new Map(stepIds.map((id) => [id, 0]));
  }

  const depMap = new Map<string, string[]>();
  for (const { step_id, depends_on } of deps) {
    if (!depMap.has(step_id)) depMap.set(step_id, []);
    depMap.get(step_id)!.push(depends_on);
  }

  const columns = new Map<string, number>();
  const visited = new Set<string>();

  function resolve(id: string): number {
    if (columns.has(id)) return columns.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);

    const myDeps = depMap.get(id);
    if (!myDeps || myDeps.length === 0) {
      columns.set(id, 0);
      return 0;
    }

    let maxDep = 0;
    for (const depId of myDeps) {
      maxDep = Math.max(maxDep, resolve(depId) + 1);
    }
    columns.set(id, maxDep);
    return maxDep;
  }

  for (const id of stepIds) {
    resolve(id);
  }

  return columns;
}

/**
 * Given steps with column assignments, compute a topological ordering
 * that respects columns (column 0 first, then 1, etc.) and preserves
 * sort_order within each column.
 */
export function topologicalOrder(
  steps: { id: string; sort_order: number }[],
  columnMap: Map<string, number>,
): string[] {
  const byCol = new Map<number, { id: string; sort_order: number }[]>();
  for (const step of steps) {
    const col = columnMap.get(step.id) ?? 0;
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col)!.push(step);
  }

  const result: string[] = [];
  const sortedCols = [...byCol.keys()].sort((a, b) => a - b);
  for (const col of sortedCols) {
    const colSteps = byCol.get(col)!;
    colSteps.sort((a, b) => a.sort_order - b.sort_order);
    for (const s of colSteps) {
      result.push(s.id);
    }
  }
  return result;
}
