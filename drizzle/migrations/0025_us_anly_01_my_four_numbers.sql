-- US-ANLY-01: provider analytics raw events, hourly rollups, dashboard cache

CREATE TABLE IF NOT EXISTS provider_analytics.raw_event (
  id                   uuid PRIMARY KEY,
  event_type           text NOT NULL,
  provider_profile_id  uuid,
  viewer_key           text,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  metadata             jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT raw_event_type_chk CHECK (event_type IN (
    'profile_view', 'search_appearance', 'contact_request', 'tap_to_call', 'search_filter_applied'
  ))
);

CREATE INDEX IF NOT EXISTS raw_event_rollup_idx
  ON provider_analytics.raw_event (occurred_at);

CREATE INDEX IF NOT EXISTS raw_event_provider_idx
  ON provider_analytics.raw_event (provider_profile_id, occurred_at);

CREATE UNIQUE INDEX IF NOT EXISTS raw_event_view_dedup_idx
  ON provider_analytics.raw_event (provider_profile_id, viewer_key, ((occurred_at AT TIME ZONE 'UTC')::date))
  WHERE event_type = 'profile_view';

CREATE UNIQUE INDEX IF NOT EXISTS raw_event_appearance_dedup_idx
  ON provider_analytics.raw_event (provider_profile_id, viewer_key, ((occurred_at AT TIME ZONE 'UTC')::date))
  WHERE event_type = 'search_appearance';

CREATE TABLE IF NOT EXISTS provider_analytics.hourly_rollup (
  provider_profile_id  uuid NOT NULL,
  hour_bucket          timestamptz NOT NULL,
  profile_views        integer NOT NULL DEFAULT 0,
  search_appearances   integer NOT NULL DEFAULT 0,
  contact_requests     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_profile_id, hour_bucket)
);

CREATE TABLE IF NOT EXISTS provider_analytics.dashboard_metric_cache (
  provider_profile_id  uuid NOT NULL,
  range_days           smallint NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  payload              jsonb NOT NULL,
  PRIMARY KEY (provider_profile_id, range_days),
  CONSTRAINT dashboard_metric_cache_range_chk CHECK (range_days IN (7, 30, 90))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_analytics TO peach_app;
