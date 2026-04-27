import type { SQL } from "bun";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Applies any *.sql files in `dir` (sorted by filename) that aren't already in
 * the migrations table. Bootstraps the tracker table from migrations.sql first.
 *
 * Pattern: `NNN_description.sql` — runner sorts lexically so prefix matters.
 * The bootstrap file `migrations.sql` (no NNN prefix) is always applied first.
 */
export async function runMigrations(sql: SQL, dir: string): Promise<void> {
  // 1. Bootstrap tracker (idempotent CREATE TABLE IF NOT EXISTS).
  const bootstrap = await readFile(join(dir, "migrations.sql"), "utf8");
  await sql.unsafe(bootstrap);

  // 2. Discover NNN_*.sql files sorted lexically.
  const files = (await readdir(dir))
    .filter(f => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  // 3. Read tracker → set of applied filenames.
  const applied = new Set<string>(
    (await sql`SELECT filename FROM migrations`).map((r: any) => r.filename)
  );

  // 4. Apply missing migrations in order.
  for (const filename of files) {
    if (applied.has(filename)) continue;
    const content = await readFile(join(dir, filename), "utf8");
    await sql.unsafe(content);
    await sql`INSERT INTO migrations (filename) VALUES (${filename})`;
    console.log(`[migrations] applied ${filename}`);
  }
}
