-- Wave 0 foundation: extensions, schemas, shared kernel tables,
-- identity user+session, platform-configuration, empty module schemas, grants.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS identity_and_access;
CREATE SCHEMA IF NOT EXISTS platform_configuration;
CREATE SCHEMA IF NOT EXISTS provider_profile;
CREATE SCHEMA IF NOT EXISTS provider_availability;
CREATE SCHEMA IF NOT EXISTS discovery_search;
CREATE SCHEMA IF NOT EXISTS direct_messaging;
CREATE SCHEMA IF NOT EXISTS provider_reviews;
CREATE SCHEMA IF NOT EXISTS trust_and_safety;
CREATE SCHEMA IF NOT EXISTS listing_billing;
CREATE SCHEMA IF NOT EXISTS provider_analytics;
CREATE SCHEMA IF NOT EXISTS user_notifications;
CREATE SCHEMA IF NOT EXISTS media_processing;

CREATE TABLE IF NOT EXISTS shared.outbox (
  event_id        uuid PRIMARY KEY,
  event_name      text NOT NULL,
  version         smallint NOT NULL DEFAULT 1,
  occurred_at     timestamptz NOT NULL,
  correlation_id  text NOT NULL,
  payload         jsonb NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  attempt_count   integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS outbox_undispatched_idx
  ON shared.outbox (published_at) WHERE dispatched_at IS NULL;

CREATE TABLE IF NOT EXISTS shared.outbox_dead_letter (
  event_id        uuid NOT NULL,
  event_name      text NOT NULL,
  version         smallint NOT NULL DEFAULT 1,
  occurred_at     timestamptz NOT NULL,
  correlation_id  text NOT NULL,
  payload         jsonb NOT NULL,
  published_at    timestamptz NOT NULL,
  subscriber      text NOT NULL,
  failed_reason   text NOT NULL,
  dead_lettered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shared.processed_events (
  event_id     uuid NOT NULL,
  subscriber   text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, subscriber)
);

CREATE TABLE IF NOT EXISTS shared.audit_log (
  id             uuid PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_id       uuid,
  actor_role     text NOT NULL,
  action         text NOT NULL,
  target_type    text NOT NULL,
  target_id      uuid NOT NULL,
  reason         text,
  metadata       jsonb NOT NULL DEFAULT '{}',
  correlation_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON shared.audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON shared.audit_log (actor_id);

CREATE UNLOGGED TABLE IF NOT EXISTS shared.rate_limit_bucket (
  bucket_key   text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE TABLE IF NOT EXISTS shared.idempotency_ledger (
  key        text PRIMARY KEY,
  status     integer NOT NULL,
  body       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_and_access."user" (
  id                 uuid PRIMARY KEY,
  is_admin           boolean NOT NULL DEFAULT false,
  email              citext UNIQUE,
  email_verified_at  timestamptz,
  phone              text,
  phone_verified_at  timestamptz,
  password_hash      text,
  display_name       text NOT NULL,
  status             text NOT NULL DEFAULT 'active',
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  anonymized_at      timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_status_chk CHECK (status IN ('active','suspended','deleted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS user_active_phone_idx
  ON identity_and_access."user"(phone)
  WHERE phone IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS user_phone_idx
  ON identity_and_access."user"(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity_and_access.session (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES identity_and_access."user"(id),
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  reauth_at    timestamptz,
  ip_address   inet NOT NULL,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS session_user_idx
  ON identity_and_access.session (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS session_expiry_idx
  ON identity_and_access.session (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS platform_configuration.area (
  id             uuid PRIMARY KEY,
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  parent_area_id uuid REFERENCES platform_configuration.area(id),
  centroid_lat   double precision NOT NULL,
  centroid_lng   double precision NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS area_parent_idx ON platform_configuration.area (parent_area_id);
CREATE INDEX IF NOT EXISTS area_name_trgm_idx
  ON platform_configuration.area USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS platform_configuration.config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES identity_and_access."user"(id)
);

CREATE TABLE IF NOT EXISTS platform_configuration.lexicon_entry (
  id          uuid PRIMARY KEY,
  term        text NOT NULL,
  entry_type  text NOT NULL,
  maps_to     jsonb NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lexicon_term_type_uq
  ON platform_configuration.lexicon_entry (lower(term), entry_type) WHERE is_active;
CREATE INDEX IF NOT EXISTS lexicon_term_trgm_idx
  ON platform_configuration.lexicon_entry USING gin (term gin_trgm_ops);

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'peach_app') THEN
    CREATE ROLE peach_app LOGIN PASSWORD 'secret';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE peach_finder TO peach_app;

GRANT USAGE ON SCHEMA shared, identity_and_access, platform_configuration,
  provider_profile, provider_availability, discovery_search, direct_messaging,
  provider_reviews, trust_and_safety, listing_billing, provider_analytics,
  user_notifications, media_processing TO peach_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shared TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity_and_access TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform_configuration TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_profile TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_availability TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA discovery_search TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA direct_messaging TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_reviews TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trust_and_safety TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA listing_billing TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_analytics TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA user_notifications TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA media_processing TO peach_app;

REVOKE UPDATE, DELETE ON shared.audit_log FROM peach_app;
GRANT INSERT, SELECT ON shared.audit_log TO peach_app;

