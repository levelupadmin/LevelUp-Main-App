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
--
-- First neutralise any pre-existing duplicate response ids created by the OLD
-- non-idempotent webhook: keep the earliest row's marker, null it on later
-- duplicates (rows are preserved; the partial index ignores NULLs). This makes
-- the index creation safe regardless of current data, so db push can't fail.
WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY tally_response_id ORDER BY created_at, id
         ) AS rn
  FROM public.cohort_applications
  WHERE tally_response_id IS NOT NULL
)
UPDATE public.cohort_applications c
SET tally_response_id = NULL
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS cohort_applications_tally_response_id_key
  ON public.cohort_applications (tally_response_id)
  WHERE tally_response_id IS NOT NULL;
