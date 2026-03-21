import type { QueryFn } from "../db/mod.ts";

/**
 * Build and execute a multi-row INSERT. Returns the result (use RETURNING if needed).
 * `columns` is the list of column names.
 * `rows` is an array of value arrays, each matching `columns` length.
 * `suffix` is optional SQL appended after VALUES (e.g. "ON CONFLICT DO NOTHING").
 */
export function bulkInsert(
  q: QueryFn,
  table: string,
  columns: string[],
  rows: unknown[][],
  options?: { returning?: string; suffix?: string },
): Promise<{ rows: Record<string, unknown>[] }> {
  if (rows.length === 0) return { rows: [] };

  const colCount = columns.length;
  const valueClauses: string[] = [];
  const params: unknown[] = [];

  for (let r = 0; r < rows.length; r++) {
    const placeholders: string[] = [];
    for (let c = 0; c < colCount; c++) {
      params.push(rows[r][c]);
      placeholders.push(`$${params.length}`);
    }
    valueClauses.push(`(${placeholders.join(", ")})`);
  }

  let sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueClauses.join(", ")}`;
  if (options?.suffix) sql += ` ${options.suffix}`;
  if (options?.returning) sql += ` RETURNING ${options.returning}`;

  return q(sql, params);
}
