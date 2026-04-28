import { SQL } from "bun";

/**
 * Returns a Postgres connection for tests, with two hard safeguards against
 * trampling on the prod DB:
 *
 *  1. TEST_DATABASE_URL must be set explicitly. We do NOT fall back to
 *     DATABASE_URL — that's exactly the foot-gun that almost wiped prod
 *     license rows during Plan 4-D prep.
 *  2. The two URLs must differ. If a developer ever sets TEST_DATABASE_URL
 *     to the prod URL by mistake, we refuse to run.
 *
 * Tests that DROP TABLE in beforeAll are allowed only against this URL.
 */
export function testDbUrl(): string {
  const test = process.env.TEST_DATABASE_URL;
  if (!test) {
    throw new Error(
      "TEST_DATABASE_URL is required for DB-backed tests.\n" +
      "Set it in backend/.env or your shell, e.g.\n" +
      "  TEST_DATABASE_URL=postgres://seoagent:seoagent_dev_pwd@127.0.0.1:5432/seoagent_test\n" +
      "It MUST point at a database different from DATABASE_URL — these tests DROP TABLE.",
    );
  }
  const prod = process.env.DATABASE_URL;
  if (prod && normalize(prod) === normalize(test)) {
    throw new Error(
      "TEST_DATABASE_URL must not equal DATABASE_URL — tests DROP TABLE and would wipe prod.\n" +
      `Got TEST_DATABASE_URL=${test}\nGot DATABASE_URL=${prod}`,
    );
  }
  return test;
}

export function openTestDb(): SQL {
  return new SQL(testDbUrl());
}

function normalize(url: string): string {
  // Lowercase + strip trailing slash; doesn't deeply parse — same string ≈ same db.
  return url.trim().toLowerCase().replace(/\/$/, "");
}
