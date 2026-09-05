-- US-MSG-04: notification batching windows and block cache for user-notifications

CREATE TABLE IF NOT EXISTS user_notifications.notification_batch_window (
  user_id         uuid NOT NULL REFERENCES identity_and_access."user"(id),
  category        text NOT NULL,
  source_key      text NOT NULL,
  opened_at       timestamptz NOT NULL,
  flush_after     timestamptz NOT NULL,
  message_count   integer NOT NULL DEFAULT 1,
  last_message_id uuid,
  in_app_notification_id uuid,
  status          text NOT NULL DEFAULT 'open',
  PRIMARY KEY (user_id, category, source_key)
);

CREATE INDEX IF NOT EXISTS batch_window_flush_idx
  ON user_notifications.notification_batch_window (flush_after)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS user_notifications.block_cache (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS notif_block_blocked_idx
  ON user_notifications.block_cache (blocked_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_notifications.notification_batch_window TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_notifications.block_cache TO peach_app;
