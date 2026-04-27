import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { SQL } from "bun";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../lib/migrations";

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const MIG_DIR = `${import.meta.dir}/../../migrations`;

describe("runMigrations", () => {
  let sql: SQL;
  beforeAll(() => { sql = new SQL(TEST_DB_URL!); });
  afterAll(async () => { await sql.close(); });
  beforeEach(async () => {
    await sql`DROP TABLE IF EXISTS migrations CASCADE`;
  });

  it("creates the tracker table on first run", async () => {
    await runMigrations(sql, MIG_DIR);
    const rows = await sql`SELECT to_regclass('migrations') AS exists`;
    expect(rows[0].exists).toBe("migrations");
  });

  it("is idempotent — second run inserts no new rows", async () => {
    await runMigrations(sql, MIG_DIR);
    const before = await sql`SELECT COUNT(*)::int AS n FROM migrations`;
    await runMigrations(sql, MIG_DIR);
    const after = await sql`SELECT COUNT(*)::int AS n FROM migrations`;
    expect(after[0].n).toBe(before[0].n);
  });

  it("rolls back partial migration on error", async () => {
    // The risky scenario: migration body succeeds, then the tracker INSERT
    // fails. Without `sql.begin` wrapping both, the migration's effects
    // persist but the tracker has no record — next boot re-runs the file
    // and crashes on "relation already exists".
    //
    // We force this by making the migration body itself drop the `migrations`
    // tracker table, so the subsequent INSERT into `migrations` fails. The
    // CREATE TABLE earlier in the body is the canary: if it survives the
    // failure, atomicity is broken.
    const tmp = await mkdtemp(join(tmpdir(), "mig-test-"));
    try {
      await writeFile(
        join(tmp, "migrations.sql"),
        `CREATE TABLE IF NOT EXISTS migrations (
           filename VARCHAR(128) PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         );`
      );
      await writeFile(
        join(tmp, "001_broken.sql"),
        `CREATE TABLE atomicity_probe (id int);
         DROP TABLE migrations;`
      );
      await sql`DROP TABLE IF EXISTS atomicity_probe CASCADE`;

      let threw = false;
      try {
        await runMigrations(sql, tmp);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      // Probe table must NOT exist — both the CREATE TABLE and DROP TABLE
      // inside 001_broken.sql should have been rolled back when the tracker
      // INSERT (which followed in the same transaction) failed.
      const probe = await sql`SELECT to_regclass('atomicity_probe') AS exists`;
      expect(probe[0].exists).toBeNull();

      // The migrations tracker itself should also still exist (the DROP
      // inside the migration body must have rolled back).
      const tracker = await sql`SELECT to_regclass('migrations') AS exists`;
      expect(tracker[0].exists).toBe("migrations");

      // Tracker must NOT have a row for the failed migration.
      const applied = await sql`
        SELECT COUNT(*)::int AS n FROM migrations WHERE filename = '001_broken.sql'
      `;
      expect(applied[0].n).toBe(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
