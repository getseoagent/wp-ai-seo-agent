-- backend/migrations/002_licenses.sql
-- Plan 4-A Block 2 Task 2.1.
-- License rows backing the HMAC+DB hybrid key format. Keys are HMAC-validated
-- on every verify (cheap, no DB hit on tamper); the DB row enables revocation,
-- N-site binding, and stripe_subscription_id-style external billing linkage.

CREATE TABLE licenses (
  key                       VARCHAR(64) PRIMARY KEY,
  status                    VARCHAR(16) NOT NULL DEFAULT 'active',
  tier                      VARCHAR(16) NOT NULL,
  max_sites                 INT NOT NULL DEFAULT 1,
  activations               JSONB NOT NULL DEFAULT '[]',
  email                     VARCHAR(255),

  wayforpay_order_reference VARCHAR(64),

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                TIMESTAMPTZ NOT NULL,
  disabled_at               TIMESTAMPTZ,
  disabled_reason           TEXT
);
CREATE INDEX licenses_status ON licenses(status);
CREATE INDEX licenses_wayforpay_ref ON licenses(wayforpay_order_reference);

-- Backfill the FK from sessions → licenses now that the parent table exists.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_license_key_fkey
  FOREIGN KEY (license_key) REFERENCES licenses(key) ON DELETE SET NULL;
