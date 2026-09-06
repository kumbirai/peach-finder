-- US-BILL-02: one free period per phone — anti-abuse link and grace tracking on listing rows

ALTER TABLE listing_billing.listing
  ADD COLUMN IF NOT EXISTS phone_history_ref text,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_continuity text NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS listing_phone_history_ref_idx
  ON listing_billing.listing (phone_history_ref)
  WHERE phone_history_ref IS NOT NULL;
