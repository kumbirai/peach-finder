-- US-BILL-04: lapse lifecycle — webhook idempotency ledger and dunning dispatch guard

CREATE TABLE IF NOT EXISTS listing_billing.processed_webhooks (
  psp_event_id  text PRIMARY KEY,
  processed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_billing.dunning_dispatches (
  provider_profile_id uuid NOT NULL REFERENCES listing_billing.listing(provider_profile_id) ON DELETE CASCADE,
  day_in_grace        integer NOT NULL,
  dispatched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_profile_id, day_in_grace)
);

CREATE INDEX IF NOT EXISTS listing_grace_due_idx
  ON listing_billing.listing (grace_ends_at)
  WHERE state = 'grace';

CREATE INDEX IF NOT EXISTS listing_trial_due_idx
  ON listing_billing.listing (trial_ends_at)
  WHERE state = 'free_listed';

CREATE INDEX IF NOT EXISTS listing_renewal_due_idx
  ON listing_billing.listing (current_period_ends_at)
  WHERE state = 'paid_listed';

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA listing_billing TO peach_app;
