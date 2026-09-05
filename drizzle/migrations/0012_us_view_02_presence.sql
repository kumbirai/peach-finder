-- US-VIEW-02: presence heartbeat table + sender index for coarse last-seen

CREATE UNLOGGED TABLE IF NOT EXISTS direct_messaging.presence (
  user_id            uuid PRIMARY KEY REFERENCES identity_and_access."user"(id),
  last_heartbeat_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS message_sender_sent_idx
  ON direct_messaging.message (sender_id, sent_at DESC);
