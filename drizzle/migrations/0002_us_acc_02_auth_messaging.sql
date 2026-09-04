-- US-ACC-02: identity auth tables + direct-messaging thread/message/pending

CREATE TABLE IF NOT EXISTS identity_and_access.oauth_link (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES identity_and_access."user"(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  provider_subject  text NOT NULL,
  email_at_link     citext,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_provider_chk CHECK (provider IN ('google','apple')),
  UNIQUE (provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS oauth_link_user_idx ON identity_and_access.oauth_link (user_id);

CREATE TABLE IF NOT EXISTS identity_and_access.email_verification_token (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES identity_and_access."user"(id) ON DELETE CASCADE,
  email        citext NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  purpose      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  CONSTRAINT evt_purpose_chk CHECK (purpose IN ('register','email_change'))
);
CREATE INDEX IF NOT EXISTS evt_user_idx
  ON identity_and_access.email_verification_token (user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS evt_expiry_idx
  ON identity_and_access.email_verification_token (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS direct_messaging.thread (
  id                  uuid PRIMARY KEY,
  seeker_id           uuid NOT NULL REFERENCES identity_and_access."user"(id),
  provider_profile_id uuid NOT NULL,
  created_at          timestamptz NOT NULL,
  last_activity_at    timestamptz NOT NULL,
  UNIQUE (seeker_id, provider_profile_id)
);
CREATE INDEX IF NOT EXISTS thread_seeker_activity_idx
  ON direct_messaging.thread (seeker_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS thread_provider_activity_idx
  ON direct_messaging.thread (provider_profile_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS direct_messaging.message (
  id                        uuid PRIMARY KEY,
  thread_id                 uuid NOT NULL REFERENCES direct_messaging.thread(id),
  sender_id                 uuid NOT NULL REFERENCES identity_and_access."user"(id),
  body                      text NOT NULL,
  sent_at                   timestamptz NOT NULL,
  delivered_at              timestamptz,
  read_at                   timestamptz,
  is_deleted_sender_account boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS message_thread_sent_idx
  ON direct_messaging.message (thread_id, sent_at);
CREATE INDEX IF NOT EXISTS message_unread_idx
  ON direct_messaging.message (thread_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS direct_messaging.pending_message (
  id                  uuid PRIMARY KEY,
  seeker_id           uuid NOT NULL REFERENCES identity_and_access."user"(id),
  provider_profile_id uuid NOT NULL,
  body                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  released_at         timestamptz
);
CREATE INDEX IF NOT EXISTS pending_message_seeker_idx
  ON direct_messaging.pending_message (seeker_id) WHERE released_at IS NULL;
