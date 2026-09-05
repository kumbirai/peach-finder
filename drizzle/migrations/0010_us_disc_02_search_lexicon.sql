-- US-DISC-02: expand deterministic search lexicon for natural-language queries.

INSERT INTO platform_configuration.lexicon_entry (id, term, entry_type, maps_to, is_active, created_at, updated_at)
SELECT '01900000-0000-7000-8000-000000000701', 'speaks zulu', 'language', '{"language":"zu"}'::jsonb, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM platform_configuration.lexicon_entry
  WHERE lower(term) = lower('speaks zulu') AND entry_type = 'language' AND is_active
);

INSERT INTO platform_configuration.lexicon_entry (id, term, entry_type, maps_to, is_active, created_at, updated_at)
SELECT '01900000-0000-7000-8000-000000000702', 'deep tissue', 'service_term', '{"serviceTagId":"01900000-0000-7000-8000-000000000201"}'::jsonb, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM platform_configuration.lexicon_entry
  WHERE lower(term) = lower('deep tissue') AND entry_type = 'service_term' AND is_active
);

INSERT INTO platform_configuration.lexicon_entry (id, term, entry_type, maps_to, is_active, created_at, updated_at)
SELECT '01900000-0000-7000-8000-000000000703', 'swedish', 'service_term', '{"serviceTagId":"01900000-0000-7000-8000-000000000202"}'::jsonb, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM platform_configuration.lexicon_entry
  WHERE lower(term) = lower('swedish') AND entry_type = 'service_term' AND is_active
);

INSERT INTO platform_configuration.lexicon_entry (id, term, entry_type, maps_to, is_active, created_at, updated_at)
SELECT '01900000-0000-7000-8000-000000000704', 'sports massage', 'service_term', '{"serviceTagId":"01900000-0000-7000-8000-000000000203"}'::jsonb, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM platform_configuration.lexicon_entry
  WHERE lower(term) = lower('sports massage') AND entry_type = 'service_term' AND is_active
);

INSERT INTO platform_configuration.lexicon_entry (id, term, entry_type, maps_to, is_active, created_at, updated_at)
SELECT '01900000-0000-7000-8000-000000000705', 'available tonight', 'intent_availability', '{"filter":"available_now"}'::jsonb, true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM platform_configuration.lexicon_entry
  WHERE lower(term) = lower('available tonight') AND entry_type = 'intent_availability' AND is_active
);
