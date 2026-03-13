import pg from "pg";

const pool = new pg.Pool({
  connectionString: Deno.env.get("DATABASE_URL"),
  max: 10,
});

export function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export default pool;
