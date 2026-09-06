-- US-ADMIN-02: identity queue doc references + admin action idempotency

ALTER TABLE trust_and_safety.verification_case
  ADD COLUMN IF NOT EXISTS doc_photo_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS trust_and_safety.processed_admin_action (
  idempotency_key text PRIMARY KEY,
  result_ref      uuid NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON trust_and_safety.processed_admin_action TO peach_app;
