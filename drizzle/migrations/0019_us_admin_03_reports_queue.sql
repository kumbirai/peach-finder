-- US-ADMIN-03: moderation actions for report resolution (act path)

CREATE TABLE IF NOT EXISTS trust_and_safety.moderation_action (
  id           uuid PRIMARY KEY,
  admin_id     uuid NOT NULL REFERENCES identity_and_access."user"(id),
  action       text NOT NULL
    CHECK (action IN ('remove_photo', 'remove_review', 'unpublish', 'suspend', 'reinstate', 'revoke_badge')),
  target_type  text NOT NULL,
  target_id    uuid NOT NULL,
  reason       text NOT NULL,
  report_id    uuid REFERENCES trust_and_safety.report(id),
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_target_idx
  ON trust_and_safety.moderation_action (target_type, target_id);
