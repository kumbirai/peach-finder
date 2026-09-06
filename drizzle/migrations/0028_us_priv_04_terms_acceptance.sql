-- US-PRIV-04: durable record of which legal documents a user accepted at registration

CREATE TABLE IF NOT EXISTS identity_and_access.terms_acceptance (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES identity_and_access."user"(id) ON DELETE CASCADE,
  document_slug     text NOT NULL,
  document_version  text NOT NULL,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terms_acceptance_slug_chk CHECK (
    document_slug IN ('privacy-policy', 'terms-of-service')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS terms_acceptance_user_doc_uq
  ON identity_and_access.terms_acceptance (user_id, document_slug);

CREATE INDEX IF NOT EXISTS terms_acceptance_user_idx
  ON identity_and_access.terms_acceptance (user_id);
