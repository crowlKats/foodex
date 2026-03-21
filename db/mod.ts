import pg from "pg";

const pool = new pg.Pool({
  connectionString: Deno.env.get("DATABASE_URL"),
  max: 10,
});

export type QueryFn = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;

// deno-lint-ignore no-explicit-any
export const query: QueryFn = (text, params) => pool.query(text, params) as any;

export async function transaction<T>(
  fn: (query: QueryFn) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // deno-lint-ignore no-explicit-any
    const q: QueryFn = ((text: string, params?: unknown[]) => client.query(text, params)) as any;
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Delete media rows (and S3 objects) not referenced by any recipe. */
export async function cleanupOrphanedMedia(
  deleteFn: (key: string) => Promise<void>,
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM media
     WHERE id NOT IN (
       SELECT cover_image_id FROM recipes WHERE cover_image_id IS NOT NULL
     )
     AND id NOT IN (
       SELECT media_id FROM recipe_step_media
     )
     RETURNING key`,
  );
  await Promise.allSettled(
    res.rows.map((r) => deleteFn(String(r.key))),
  );
  return res.rows.length;
}

export default pool;
