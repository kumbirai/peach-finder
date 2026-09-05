-- US-VIEW-05: review display fields (edited marker, provider reply) per provider-reviews LLD §3

ALTER TABLE provider_reviews.review
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_body text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

ALTER TABLE provider_reviews.review
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE provider_reviews.review
  DROP CONSTRAINT IF EXISTS review_reply_body_len;

ALTER TABLE provider_reviews.review
  ADD CONSTRAINT review_reply_body_len CHECK (reply_body IS NULL OR char_length(reply_body) <= 1000);
