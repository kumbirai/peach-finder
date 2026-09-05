-- US-MSG-06: report filing for thread safety actions (trust-and-safety system of record)

CREATE TABLE IF NOT EXISTS trust_and_safety.report (
  id              uuid PRIMARY KEY,
  reporter_id     uuid NOT NULL REFERENCES identity_and_access."user"(id),
  target_type     text NOT NULL
    CHECK (target_type IN ('profile', 'review', 'photo', 'thread')),
  target_id       uuid NOT NULL,
  reason          text NOT NULL
    CHECK (reason IN ('safety_concern', 'fake_profile_photos', 'harassment', 'spam_scam', 'other')),
  free_text       text CHECK (free_text IS NULL OR char_length(free_text) <= 2000),
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'dismissed', 'acted')),
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES identity_and_access."user"(id),
  resolution_note text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_resolution_consistent CHECK (
    (status = 'open' AND resolved_at IS NULL) OR
    (status = 'dismissed' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_note IS NOT NULL) OR
    (status = 'acted' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS report_queue_idx
  ON trust_and_safety.report (created_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS report_target_history_idx
  ON trust_and_safety.report (target_type, target_id);
