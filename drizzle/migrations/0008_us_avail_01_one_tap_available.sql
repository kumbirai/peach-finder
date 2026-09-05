-- US-AVAIL-01: align provider_availability schema with LLD §3

DO $$ BEGIN
  CREATE TYPE provider_availability.state AS ENUM ('not_available', 'available', 'expiry_warned');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE provider_availability.history_event AS ENUM ('set', 'renewed', 'cleared', 'warned', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE provider_availability.availability RENAME TO availability_status;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

ALTER TABLE IF EXISTS provider_availability.availability_status
  ALTER COLUMN state DROP DEFAULT;

ALTER TABLE IF EXISTS provider_availability.availability_status
  DROP CONSTRAINT IF EXISTS availability_state_chk;

DO $$ BEGIN
  ALTER TABLE provider_availability.availability_status
    ALTER COLUMN state TYPE provider_availability.state
    USING (
      CASE state::text
        WHEN 'available' THEN 'available'::provider_availability.state
        WHEN 'expiry_warned' THEN 'expiry_warned'::provider_availability.state
        ELSE 'not_available'::provider_availability.state
      END
    );
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE IF EXISTS provider_availability.availability_status
  ALTER COLUMN state SET DEFAULT 'not_available'::provider_availability.state;

ALTER TABLE IF EXISTS provider_availability.availability_status
  ADD COLUMN IF NOT EXISTS warned_at timestamptz;

CREATE INDEX IF NOT EXISTS availability_status_expiry_idx
  ON provider_availability.availability_status (expires_at)
  WHERE state IN ('available', 'expiry_warned');

CREATE INDEX IF NOT EXISTS availability_status_warn_idx
  ON provider_availability.availability_status (expires_at)
  WHERE state = 'available' AND warned_at IS NULL;

CREATE TABLE IF NOT EXISTS provider_availability.availability_history (
  id                   uuid PRIMARY KEY,
  provider_profile_id  uuid NOT NULL,
  event_type           provider_availability.history_event NOT NULL,
  occurred_at          timestamptz NOT NULL,
  set_at               timestamptz,
  correlation_id       text NOT NULL
);

CREATE INDEX IF NOT EXISTS availability_history_provider_idx
  ON provider_availability.availability_history (provider_profile_id, occurred_at);

CREATE INDEX IF NOT EXISTS availability_history_activity_idx
  ON provider_availability.availability_history (provider_profile_id, occurred_at)
  WHERE event_type IN ('set', 'renewed');

-- 0001 re-creates this table on every migrate after the rename above; drop the orphan.
DROP TABLE IF EXISTS provider_availability.availability;
