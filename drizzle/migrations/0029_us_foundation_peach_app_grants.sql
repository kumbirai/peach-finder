-- Tables created after foundation bootstrap GRANTs did not inherit peach_app privileges.
-- Re-apply schema-wide grants and default privileges for forward migrations.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA direct_messaging TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity_and_access TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA provider_availability TO peach_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trust_and_safety TO peach_app;

REVOKE UPDATE, DELETE ON shared.audit_log FROM peach_app;
GRANT INSERT, SELECT ON shared.audit_log TO peach_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA direct_messaging GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO peach_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity_and_access GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO peach_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA provider_availability GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO peach_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA trust_and_safety GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO peach_app;
