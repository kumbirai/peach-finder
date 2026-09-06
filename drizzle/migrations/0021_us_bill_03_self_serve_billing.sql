-- US-BILL-03: self-serve billing — payment method refs, renewal cancel, itemized invoices

ALTER TABLE listing_billing.listing
  ADD COLUMN IF NOT EXISTS psp_customer_ref text,
  ADD COLUMN IF NOT EXISTS psp_authorization_code text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS listing_billing.invoice (
  id                  uuid PRIMARY KEY,
  provider_profile_id uuid NOT NULL REFERENCES listing_billing.listing(provider_profile_id) ON DELETE CASCADE,
  line_item           text NOT NULL CHECK (line_item IN ('listing', 'featuring')),
  amount_cents        integer NOT NULL,
  currency            text NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  status              text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  psp_invoice_ref     text,
  issued_at           timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);

CREATE INDEX IF NOT EXISTS invoice_provider_idx
  ON listing_billing.invoice (provider_profile_id, issued_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA listing_billing TO peach_app;
