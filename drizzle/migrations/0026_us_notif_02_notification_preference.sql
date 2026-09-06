-- US-NOTIF-02: per-user notification channel preferences (opt-out-able categories only)

CREATE TABLE IF NOT EXISTS user_notifications.notification_preference (
  user_id  uuid NOT NULL REFERENCES identity_and_access."user"(id),
  category text NOT NULL,
  channel  text NOT NULL,
  enabled  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_notifications.notification_preference TO peach_app;
