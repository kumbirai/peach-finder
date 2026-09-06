-- US-BILL-05: featuring add-on independent lifecycle

CREATE TABLE IF NOT EXISTS listing_billing.featuring_addon (
  id                      uuid PRIMARY KEY,
  provider_profile_id     uuid NOT NULL REFERENCES listing_billing.listing(provider_profile_id) ON DELETE CASCADE,
  state                   text NOT NULL,
  current_period_ends_at  timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT featuring_state_chk CHECK (state IN ('active', 'lapsed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS featuring_one_active_idx
  ON listing_billing.featuring_addon (provider_profile_id)
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS featuring_renewal_due_idx
  ON listing_billing.featuring_addon (current_period_ends_at)
  WHERE state = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON listing_billing.featuring_addon TO peach_app;
