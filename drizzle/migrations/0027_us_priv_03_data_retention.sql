-- US-PRIV-03: identity-document purge tracking on decided verification cases

ALTER TABLE trust_and_safety.verification_case
  ADD COLUMN IF NOT EXISTS docs_purged_at timestamptz;
