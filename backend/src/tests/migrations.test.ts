import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { SQL } from "bun";
import { runMigrations } from "../lib/migrations";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe("runMigrations", () => {
  let sql: SQL;
  beforeAll(() => { sql = new SQL(TEST_DB_URL!); });
  afterAll(async () => { await sql.close(); });
  beforeEach(async () => {
    await sql`DROP TABLE IF EXISTS migrations CASCADE`;
  });

  it("creates the tracker table on first run", async () => {
    await runMigrations(sql, "/home/seo-friendly/htdocs/wp-ai-seo-agent/backend/migrations");
    const rows = await sql`SELECT to_regclass('migrations') AS exists`;
    expect(rows[0].exists).toBe("migrations");
  });

  it("is idempotent — second run inserts no new rows", async () => {
    await runMigrations(sql, "/home/seo-friendly/htdocs/wp-ai-seo-agent/backend/migrations");
    const before = await sql`SELECT COUNT(*)::int AS n FROM migrations`;
    await runMigrations(sql, "/home/seo-friendly/htdocs/wp-ai-seo-agent/backend/migrations");
    const after = await sql`SELECT COUNT(*)::int AS n FROM migrations`;
    expect(after[0].n).toBe(before[0].n);
  });
});
