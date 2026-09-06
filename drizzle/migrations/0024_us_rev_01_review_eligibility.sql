-- US-REV-01: one review per seeker-provider pair and optional body length cap

ALTER TABLE provider_reviews.review
  DROP CONSTRAINT IF EXISTS review_body_len;

ALTER TABLE provider_reviews.review
  ADD CONSTRAINT review_body_len CHECK (body IS NULL OR char_length(body) <= 1000);

ALTER TABLE provider_reviews.review
  DROP CONSTRAINT IF EXISTS one_review_per_pair;

ALTER TABLE provider_reviews.review
  ADD CONSTRAINT one_review_per_pair UNIQUE (provider_profile_id, reviewer_id);
