-- US-PONB-03: full media-processing schema, photo variants, service tag proposals

DO $$ BEGIN
  CREATE TYPE provider_profile.proposal_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE media_processing.photo
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS object_key text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS failed_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS media_processing.photo_variant (
  photo_id  uuid NOT NULL REFERENCES media_processing.photo(id) ON DELETE CASCADE,
  variant   text NOT NULL,
  url       text NOT NULL,
  width     integer NOT NULL,
  height    integer NOT NULL,
  PRIMARY KEY (photo_id, variant)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'media_processing'
      AND table_name = 'photo'
      AND column_name = 'card_url'
  ) THEN
    INSERT INTO media_processing.photo_variant (photo_id, variant, url, width, height)
    SELECT id, 'card_640', card_url, 640, 480
    FROM media_processing.photo
    WHERE card_url IS NOT NULL AND card_url <> ''
    ON CONFLICT DO NOTHING;

    INSERT INTO media_processing.photo_variant (photo_id, variant, url, width, height)
    SELECT id, 'gallery_1280', gallery_url, 1280, 720
    FROM media_processing.photo
    WHERE gallery_url IS NOT NULL AND gallery_url <> ''
    ON CONFLICT DO NOTHING;

    ALTER TABLE media_processing.photo DROP COLUMN card_url;
    ALTER TABLE media_processing.photo DROP COLUMN gallery_url;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS photo_owner_idx ON media_processing.photo (owner_id);
CREATE INDEX IF NOT EXISTS photo_status_idx
  ON media_processing.photo (status)
  WHERE status IN ('pending', 'processing');
CREATE UNIQUE INDEX IF NOT EXISTS photo_content_hash_idx
  ON media_processing.photo (bucket, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_profile.service_tag_proposal (
  id           uuid PRIMARY KEY,
  proposed_by  uuid NOT NULL REFERENCES identity_and_access."user"(id),
  name         text NOT NULL,
  status       provider_profile.proposal_status NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_tag_proposal_status_idx
  ON provider_profile.service_tag_proposal (status, created_at)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA media_processing TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_profile TO peach_app;
