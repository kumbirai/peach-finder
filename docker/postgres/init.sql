-- Local bootstrap: extensions, application role, and database privileges.
-- Production equivalent lives in the later deployment-docs stage.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'peach_app') THEN
    CREATE ROLE peach_app LOGIN PASSWORD 'secret';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE peach_finder TO peach_app;
GRANT CREATE ON DATABASE peach_finder TO peach_app;
