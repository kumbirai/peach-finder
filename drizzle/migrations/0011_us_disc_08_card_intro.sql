-- US-DISC-08: intro extract on search cards (FR-SRCH-11).
ALTER TABLE discovery_search.search_projection
  ADD COLUMN IF NOT EXISTS intro_extract text NOT NULL DEFAULT '';

UPDATE discovery_search.search_projection sp
SET intro_extract = LEFT(TRIM(COALESCE(pp.intro, '')), 150)
FROM provider_profile.provider_profile pp
WHERE pp.id = sp.provider_profile_id
  AND sp.intro_extract = '';
