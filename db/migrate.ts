import pool from "./mod.ts";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query(
      "SELECT name FROM _migrations ORDER BY name",
    );
    const appliedSet = new Set(
      applied.rows.map((r: { name: string }) => r.name),
    );

    const migrationsDir = new URL("./migrations/", import.meta.url);
    const entries: string[] = [];
    for await (const entry of Deno.readDir(migrationsDir)) {
      if (entry.isFile && entry.name.endsWith(".sql")) {
        entries.push(entry.name);
      }
    }
    entries.sort();

    for (const name of entries) {
      if (appliedSet.has(name)) {
        console.log(`  skip: ${name}`);
        continue;
      }
      const sql = await Deno.readTextFile(new URL(name, migrationsDir));
      console.log(`  apply: ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          name,
        ]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  Deno.exit(1);
});
