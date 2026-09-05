-- US-PONB-05: edit-live badge suppression + badge_state authority

CREATE TABLE IF NOT EXISTS trust_and_safety.badge_state (
  provider_profile_id     uuid PRIMARY KEY REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  identity_verified       boolean NOT NULL DEFAULT false,
  identity_verified_since timestamptz,
  suppressed              boolean NOT NULL DEFAULT false,
  suppressed_reason       text,
  active_this_week        boolean NOT NULL DEFAULT false,
  active_this_week_since  timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trust_and_safety.verification_case (
  id                  uuid PRIMARY KEY,
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz,
  decided_by          uuid REFERENCES identity_and_access."user"(id),
  decision_reason     text
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_case_pending_idx
  ON trust_and_safety.verification_case (provider_profile_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS verification_queue_idx
  ON trust_and_safety.verification_case (submitted_at)
  WHERE status = 'pending';

INSERT INTO trust_and_safety.badge_state (
  provider_profile_id,
  identity_verified,
  identity_verified_since,
  suppressed,
  active_this_week,
  active_this_week_since,
  updated_at
)
SELECT
  provider_profile_id,
  bool_or(badge = 'identity_verified'),
  min(CASE WHEN badge = 'identity_verified' THEN granted_at END),
  false,
  bool_or(badge = 'active_this_week'),
  min(CASE WHEN badge = 'active_this_week' THEN granted_at END),
  now()
FROM trust_and_safety.provider_badge
GROUP BY provider_profile_id
ON CONFLICT (provider_profile_id) DO UPDATE SET
  identity_verified = EXCLUDED.identity_verified,
  identity_verified_since = COALESCE(trust_and_safety.badge_state.identity_verified_since, EXCLUDED.identity_verified_since),
  active_this_week = EXCLUDED.active_this_week,
  active_this_week_since = COALESCE(trust_and_safety.badge_state.active_this_week_since, EXCLUDED.active_this_week_since),
  updated_at = now();

GRANT SELECT, INSERT, UPDATE, DELETE ON trust_and_safety.badge_state TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON trust_and_safety.verification_case TO peach_app;
