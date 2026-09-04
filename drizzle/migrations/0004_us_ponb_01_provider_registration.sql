-- US-PONB-01: provider registration OTP + durable phone registry anchor

CREATE TABLE IF NOT EXISTS identity_and_access.phone_otp (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES identity_and_access."user"(id) ON DELETE CASCADE,
  phone         text NOT NULL,
  code_hash     text NOT NULL,
  purpose       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  CONSTRAINT otp_purpose_chk CHECK (purpose IN ('register', 'phone_change'))
);
CREATE INDEX IF NOT EXISTS phone_otp_user_idx
  ON identity_and_access.phone_otp (user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS phone_otp_expiry_idx
  ON identity_and_access.phone_otp (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS identity_and_access.phone_registry_history (
  phone_hash          text PRIMARY KEY,
  first_registered_at timestamptz NOT NULL DEFAULT now(),
  last_registered_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prh_first_seen_idx
  ON identity_and_access.phone_registry_history (first_registered_at);
