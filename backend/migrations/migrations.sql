-- backend/migrations/migrations.sql
-- Tracker table for the migrations runner. Idempotent — uses IF NOT EXISTS.
-- Plan 4-A Block 1 Task 1.2.
CREATE TABLE IF NOT EXISTS migrations (
  filename     VARCHAR(128) PRIMARY KEY,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
