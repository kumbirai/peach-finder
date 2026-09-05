-- US-AVAIL-03: user-notifications in-app store for expiry renewal prompts

CREATE TABLE IF NOT EXISTS user_notifications.notification_log (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES identity_and_access."user"(id),
  category            text NOT NULL,
  channel             text NOT NULL,
  status              text NOT NULL,
  title               text,
  body                text,
  deep_link_path      text,
  related_entity_type text,
  related_entity_id   uuid,
  read_at             timestamptz,
  dispatched_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  correlation_id      text NOT NULL
);

CREATE INDEX IF NOT EXISTS notif_inapp_inbox_idx
  ON user_notifications.notification_log (user_id, created_at DESC)
  WHERE channel = 'in_app';

CREATE INDEX IF NOT EXISTS notif_inapp_unread_idx
  ON user_notifications.notification_log (user_id)
  WHERE channel = 'in_app' AND read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_notifications.notification_log TO peach_app;
