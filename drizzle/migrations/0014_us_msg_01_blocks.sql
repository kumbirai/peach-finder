-- US-MSG-01: block enforcement for messaging (trust-and-safety system of record + direct-messaging mirror)

CREATE TABLE IF NOT EXISTS trust_and_safety.block (
  blocker_id  uuid NOT NULL REFERENCES identity_and_access."user"(id),
  blocked_id  uuid NOT NULL REFERENCES identity_and_access."user"(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT block_no_self_block CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS block_blocked_idx ON trust_and_safety.block (blocked_id);

CREATE TABLE IF NOT EXISTS direct_messaging.block_cache (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS block_cache_blocked_idx ON direct_messaging.block_cache (blocked_id);
