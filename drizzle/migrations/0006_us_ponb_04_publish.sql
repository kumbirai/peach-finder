-- US-PONB-04: publish flow — listing trial clock starts at first publish, not registration

ALTER TABLE listing_billing.listing
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE listing_billing.listing
  ALTER COLUMN state SET DEFAULT 'building';
