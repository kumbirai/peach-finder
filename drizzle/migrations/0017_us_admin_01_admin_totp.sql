-- US-ADMIN-01: admin TOTP enrollment store (SR-SEC-08)

CREATE TABLE IF NOT EXISTS identity_and_access.admin_totp (
  user_id            uuid PRIMARY KEY REFERENCES identity_and_access."user"(id) ON DELETE CASCADE,
  secret_encrypted   bytea NOT NULL,
  enrolled_at        timestamptz NOT NULL DEFAULT now(),
  backup_codes_hash  text[] NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity_and_access.admin_totp TO peach_app;
