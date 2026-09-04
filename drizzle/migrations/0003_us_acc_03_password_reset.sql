-- US-ACC-03: password reset tokens for stay-signed-in / sign-out-anywhere

CREATE TABLE IF NOT EXISTS identity_and_access.password_reset_token (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES identity_and_access."user"(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS prt_user_idx
  ON identity_and_access.password_reset_token (user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS prt_expiry_idx
  ON identity_and_access.password_reset_token (expires_at) WHERE consumed_at IS NULL;
