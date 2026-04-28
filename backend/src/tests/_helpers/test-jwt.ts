/**
 * Canonical JWT secret for tests.
 *
 * Bun auto-loads `backend/.env` (which carries the *prod* JWT_SECRET in this
 * dev environment). Tests that sign their own tokens have to:
 *  1. import this constant for both the signer's and the verifier's secret,
 *     and
 *  2. force-override `process.env.JWT_SECRET` in beforeAll — the auto-loaded
 *     prod value would otherwise win and the verifier would reject test-
 *     signed tokens with `bad_signature`.
 *
 * `setupTestJwt()` does (2) once for the calling describe block. Use it
 * instead of writing `process.env.JWT_SECRET = TEST_JWT_SECRET` by hand.
 */
export const TEST_JWT_SECRET = "test-jwt-secret-32-bytes-min-pls!";

export function setupTestJwt(): void {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
}
