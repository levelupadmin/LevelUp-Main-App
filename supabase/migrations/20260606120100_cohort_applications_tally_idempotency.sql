-- Idempotency for the Tally application webhook.
--
-- tally-application-webhook did a non-atomic "look up by (offering_id, email),
-- else INSERT". Tally retries delivery when our 2xx is slow, so two
-- near-simultaneous deliveries of the SAME form response could both miss the
-- lookup and insert duplicate cohort_applications rows.
--
-- Each Tally submission carries a stable responseId. Make it the idempotency
-- key: a retry of the same response now hits this unique index (23505), which
-- the webhook catches and treats as an already-processed success. Genuine
-- re-submissions by the same email (a new responseId) still flow through the
-- (offering_id, email) update path.
--
-- Partial index (WHERE NOT NULL) so legacy/manual rows without a response id
-- are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS cohort_applications_tally_response_id_key
  ON public.cohort_applications (tally_response_id)
  WHERE tally_response_id IS NOT NULL;
