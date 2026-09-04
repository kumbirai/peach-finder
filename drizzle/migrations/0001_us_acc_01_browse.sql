-- US-ACC-01: provider profiles, discovery projection, and supporting read tables.

DO $$ BEGIN
  CREATE TYPE provider_profile.publish_state AS ENUM ('draft', 'published', 'unpublished');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE provider_profile.unpublish_reason AS ENUM ('owner', 'admin', 'billing_lapse');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE provider_profile.photo_status AS ENUM ('pending', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS provider_profile.service_tag (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_tag_active_idx ON provider_profile.service_tag (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS provider_profile.provider_profile (
  id                 uuid PRIMARY KEY,
  owner_id           uuid NOT NULL UNIQUE REFERENCES identity_and_access."user"(id),
  area_id            uuid REFERENCES platform_configuration.area(id),
  intro              text,
  publish_state      provider_profile.publish_state NOT NULL DEFAULT 'draft',
  unpublish_reason   provider_profile.unpublish_reason,
  phone_visible      boolean NOT NULL DEFAULT false,
  first_published_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unpublish_reason_consistency CHECK (
    (publish_state = 'unpublished') = (unpublish_reason IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS provider_profile_area_idx ON provider_profile.provider_profile (area_id);
CREATE INDEX IF NOT EXISTS provider_profile_state_idx ON provider_profile.provider_profile (publish_state);

CREATE TABLE IF NOT EXISTS provider_profile.service (
  id                  uuid PRIMARY KEY,
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  duration_minutes    integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 600),
  price_cents         integer NOT NULL CHECK (price_cents >= 0),
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_profile_idx ON provider_profile.service (provider_profile_id, sort_order);

CREATE TABLE IF NOT EXISTS provider_profile.provider_service_tag (
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  service_tag_id      uuid NOT NULL REFERENCES provider_profile.service_tag(id),
  PRIMARY KEY (provider_profile_id, service_tag_id)
);

CREATE TABLE IF NOT EXISTS provider_profile.language (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provider_profile.provider_language (
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  language_code       text NOT NULL REFERENCES provider_profile.language(code),
  PRIMARY KEY (provider_profile_id, language_code)
);

CREATE TABLE IF NOT EXISTS provider_profile.provider_photo (
  id                  uuid PRIMARY KEY,
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  photo_id            uuid NOT NULL,
  status              provider_profile.photo_status NOT NULL DEFAULT 'pending',
  sort_order          integer NOT NULL DEFAULT 0,
  is_primary          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_profile_id, photo_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_photo_one_primary_idx
  ON provider_profile.provider_photo (provider_profile_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS provider_availability.availability (
  provider_profile_id uuid PRIMARY KEY,
  state               text NOT NULL DEFAULT 'not_available',
  set_at              timestamptz,
  expires_at          timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_state_chk CHECK (state IN ('available', 'not_available', 'expiry_warned'))
);

CREATE TABLE IF NOT EXISTS provider_reviews.rating_aggregate (
  provider_profile_id uuid PRIMARY KEY,
  average             numeric(2,1),
  count               integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_reviews.review (
  id                  uuid PRIMARY KEY,
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  reviewer_id         uuid NOT NULL REFERENCES identity_and_access."user"(id),
  rating              smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_profile_idx ON provider_reviews.review (provider_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trust_and_safety.provider_badge (
  provider_profile_id uuid NOT NULL REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  badge               text NOT NULL,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_profile_id, badge)
);

CREATE TABLE IF NOT EXISTS listing_billing.listing (
  provider_profile_id uuid PRIMARY KEY REFERENCES provider_profile.provider_profile(id) ON DELETE CASCADE,
  state               text NOT NULL DEFAULT 'free_listed',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_processing.photo (
  id           uuid PRIMARY KEY,
  owner_id     uuid NOT NULL REFERENCES identity_and_access."user"(id),
  status       text NOT NULL DEFAULT 'ready',
  card_url     text NOT NULL,
  gallery_url  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovery_search.search_projection (
  provider_profile_id     uuid PRIMARY KEY,
  owner_id                uuid NOT NULL,
  display_name            text NOT NULL,
  search_text             text NOT NULL DEFAULT '',
  intro_tsvector          tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(search_text, ''))) STORED,
  service_tag_ids         uuid[] NOT NULL DEFAULT '{}',
  language_codes          text[] NOT NULL DEFAULT '{}',
  area_id                 uuid NOT NULL REFERENCES platform_configuration.area(id),
  price_min_cents         integer,
  price_max_cents         integer,
  availability_state      text NOT NULL DEFAULT 'not_available',
  availability_set_at     timestamptz,
  rating_average          numeric(2,1),
  rating_count            integer NOT NULL DEFAULT 0,
  badge_identity_verified boolean NOT NULL DEFAULT false,
  badge_active_this_week  boolean NOT NULL DEFAULT false,
  is_featured             boolean NOT NULL DEFAULT false,
  featured_since          timestamptz,
  last_activity_at        timestamptz,
  photo_primary_url       text,
  published_at            timestamptz NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_projection_tsv_idx ON discovery_search.search_projection USING gin (intro_tsvector);
CREATE INDEX IF NOT EXISTS search_projection_trgm_idx ON discovery_search.search_projection USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS search_projection_tags_idx ON discovery_search.search_projection USING gin (service_tag_ids);
CREATE INDEX IF NOT EXISTS search_projection_lang_idx ON discovery_search.search_projection USING gin (language_codes);
CREATE INDEX IF NOT EXISTS search_projection_area_idx ON discovery_search.search_projection (area_id);
CREATE INDEX IF NOT EXISTS search_projection_owner_idx ON discovery_search.search_projection (owner_id);
CREATE INDEX IF NOT EXISTS search_projection_rank_idx ON discovery_search.search_projection
  ((availability_state = 'available') DESC, availability_set_at DESC, is_featured DESC);

CREATE TABLE IF NOT EXISTS discovery_search.blocked_pair (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS discovery_search.suggest_term (
  term      text NOT NULL,
  kind      text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (term, kind)
);
CREATE INDEX IF NOT EXISTS suggest_term_trgm_idx ON discovery_search.suggest_term USING gin (term gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_profile TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_availability TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_reviews TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trust_and_safety TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA listing_billing TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA media_processing TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA discovery_search TO peach_app;
