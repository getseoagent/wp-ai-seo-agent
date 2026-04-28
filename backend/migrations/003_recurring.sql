-- backend/migrations/003_recurring.sql
-- Plan 4-A Block 4 Task 4.1.
-- Recurring billing state on the licenses table — recToken from WayForPay's
-- first successful payment lets the worker (Task 4.3) charge the same card
-- monthly. Retry state machine columns track the [1d, 3d, 7d] dunning
-- schedule before transitioning to recurring_state='cancelled'.

ALTER TABLE licenses
  ADD COLUMN wayforpay_recurring_token VARCHAR(64),
  ADD COLUMN wayforpay_card_pan        VARCHAR(20),
  ADD COLUMN recurring_state           VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN next_charge_at            TIMESTAMPTZ,
  ADD COLUMN last_charge_attempt_at    TIMESTAMPTZ,
  ADD COLUMN last_charge_result        VARCHAR(16),
  ADD COLUMN retry_count               SMALLINT    NOT NULL DEFAULT 0,
  ADD COLUMN cancelled_at              TIMESTAMPTZ,
  ADD COLUMN renewal_reminder_sent_for TIMESTAMPTZ;

-- Hot path: worker scans WHERE recurring_state='active' AND next_charge_at <= NOW().
-- Partial index keeps us off the cancelled rows entirely.
CREATE INDEX licenses_due_charges
  ON licenses(next_charge_at)
  WHERE recurring_state = 'active';
