-- ============================================================
-- PHASE RE — The re-entry reminder ladder's OWN idempotency ledger (E-1)
-- ============================================================
--
-- WHY A NEW TABLE AND NOT `cohort_notifications_log`. That table cannot hold
-- these rows. Its `user_id` is `uuid NOT NULL REFERENCES public.users(id)`
-- (20260526210000_cohort_notification_templates.sql:68) and its UNIQUE is
-- `(template_key, user_id, related_kind, related_id)` (:73). The population
-- this ladder addresses is precisely the people who filled the Tally form and
-- never came back: `cohort_applications.user_id` is NULLABLE while `email` is
-- NOT NULL, so a recoverable applicant routinely has no `public.users` row at
-- all. Keying on the user would drop exactly the rows the ladder exists for,
-- and a NULL in a UNIQUE never collides — the idempotency guarantee would be
-- silently absent for the very rows that need it. So this ledger is keyed on
-- the APPLICATION. Same shape, same discipline, correct key.
--
-- WHICH ROWS ACTUALLY LAND HERE, STATED PLAINLY SO NOBODY READS MORE INTO AN
-- EMPTY TABLE THAN IT SAYS. Only applications the reconciler has read. The
-- original browser-only writer could not reach `user_id`-NULL rows; follow-up
-- migration 20260803173000 adds a service-only, application-scoped refresh for
-- those completed applications. `_shared/ladder.ts` still reads the pool only
-- from the reconciled mirror and never guesses from local status defaults.
--
-- Deriving the pool from the application's own `status` / `app_fee_paid_at`
-- where the reconciler is silent was tried and REMOVED, because those columns
-- are never written for that population: `tally-application-poll` writes
-- `status = 'submitted'` on insert and never updates it, and neither the
-- reconciler nor `razorpay-webhook` (which keys on a `payment_orders` row only
-- a signed-in user can create) can touch such a row. Their `status` stays
-- 'submitted' and `app_fee_paid_at` stays NULL whether the applicant ignored us
-- or paid, interviewed and enrolled off-app — and off-app is the norm, which is
-- why the reconciler matches raw Razorpay captures and TeleCRM statuses rather
-- than `payment_orders`. So this ledger holds fewer rows than the drop-off
-- population, on purpose. Silence for an applicant we cannot see beats mailing
-- "complete your ₹400" to somebody who is already enrolled.
--
-- THE TEMPLATE KEYS ARE PER-RUNG, NOT PER-POOL, AND THAT IS THE DESIGN. The
-- UNIQUE below permits exactly one row per (application, template_key) forever.
-- With one key per pool a ladder could therefore only ever have one step, the
-- "≤4 per application" cap would be unreachable, and E-2's cadence would have
-- nothing to hang on. The six keys this engine can write — defined in
-- `supabase/functions/_shared/ladder.ts` (`LADDERS`) and mirrored in the CHECK
-- constraint below so the database refuses a key the engine cannot produce:
--
--     reentry_fee_nudge_1        T+2h    completed_no_fee → pay the ₹400
--     reentry_fee_nudge_2        T+26h
--     reentry_fee_nudge_3        T+74h
--     reentry_interview_nudge_1  T+2h    fee-paid-no-interview → book the slot
--     reentry_interview_nudge_2  T+26h
--     reentry_interview_nudge_3  T+74h
--
-- THE ANCHOR CONTRACT THOSE OFFSETS ARE MEASURED FROM (`anchorFor` in
-- `_shared/ladder.ts`, and E-2's cadence has to line up with it):
--   * fee ladder       → `cohort_applications.created_at`, always.
--   * interview ladder → `app_fee_paid_at` when it is set, ELSE `created_at`.
-- The interview fallback is not a nicety. `app_fee_paid_at` has exactly two
-- writers, both in-app Razorpay flows, while the `fee-paid-no-interview` stage
-- is ALSO derived from off-app evidence (a matched Razorpay capture or the
-- TeleCRM 'application fee paid' status, `_shared/reconcile.ts`). An applicant
-- who paid by payment link therefore has the stage and a NULL timestamp, and
-- without the fallback would be silent forever. `created_at` is NOT NULL, never
-- moves, and is necessarily earlier than any payment, so a fallback-anchored
-- rung comes due later in that applicant's story than a true-anchored one, never
-- earlier.
--
-- E-2 supplies the copy for these keys and must not invent new ones without
-- adding them here — the CHECK is what keeps the two files honest with each
-- other.
--
-- HOW A DOUBLE-SEND IS MADE IMPOSSIBLE — BY THIS CONSTRAINT, NOT BY TIMING.
-- The handler CLAIMS a rung before it dispatches: it INSERTs
-- (application_id, template_key) first and only sends if that insert returned a
-- row. Two cron invocations that overlap both decide the same rung for the same
-- application (the decision is a pure function of the row and the ledger, so
-- they cannot disagree), both attempt the same INSERT, and Postgres serialises
-- them on this UNIQUE: one commits, the other gets 23505 and skips without
-- sending. No lock, no advisory key, no assumption about how long a run takes —
-- the guarantee is the constraint. `dispatched_at` then records whether the
-- claimed message actually left, so a claim that failed to send is visible
-- rather than indistinguishable from a delivered one.
--
-- AND THE ≤1/DAY CAP GETS ITS OWN UNIQUE, BECAUSE THE RUNG KEY DOES NOT COVER
-- IT. The paragraph above holds only while both invocations see the SAME state
-- and therefore pick the SAME key. Two that see DIFFERENT state pick keys from
-- DIFFERENT pools and never collide. That is reachable, not theoretical: the
-- interview ladder's anchor is `app_fee_paid_at ?? created_at`, and the
-- reconciler — the only writer that can move a row into
-- `fee-paid-no-interview` — does NOT write `app_fee_paid_at`. So the instant a
-- row acquires that stage with the timestamp still NULL, its rung 1 is due
-- against the OLD `created_at` anchor, while an invocation already in flight is
-- still holding the fee pool's decision for the same application. Different
-- pools, different keys, no collision, and BOTH SEND — on the same day, to the
-- same person. The ≤1/day cap cannot stop it in the engine: it is evaluated
-- against a send history each invocation read once, BEFORE either wrote, which
-- is a read-then-write race by construction.
--
-- So the day is a COLUMN. `ist_day` is derived in the pure layer by
-- `ledgerKey()` (`_shared/ladder.ts`) from the same explicit clock the decision
-- was made on — never from `now()` here, which would be a second, disagreeing
-- clock at exactly the boundary minute where the two must agree — and
-- `reentry_notif_daily_unique` makes Postgres serialise the two INSERTs. The
-- loser gets 23505 and sends nothing, whichever pool it thought it was in.
--
-- IST, not UTC, and stored as `YYYY-MM-DD` text rather than a `date`: the unit
-- the cap counts in is the applicant's calendar day, IST is UTC+05:30 with no
-- DST, and text keeps the column byte-identical to what the pure layer produced
-- with no server `TimeZone` setting anywhere in the path to disagree with it.
--
-- Additive, idempotent, re-runnable and reversible (reversal at the foot). It
-- contains NO `RAISE EXCEPTION`: a shared `db push` runs every pending
-- migration, and this one must never be the reason another branch's migration
-- fails to apply.

CREATE TABLE IF NOT EXISTS public.reentry_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.cohort_applications(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  channel text NOT NULL,
  -- The IST calendar day this claim spends, as `YYYY-MM-DD`, written by
  -- `ledgerKey()` off the decision's own clock. NULLABLE ON PURPOSE — see the
  -- guarded ALTER below: this file's CREATE is `IF NOT EXISTS`, so a table an
  -- earlier run already created reaches the column through that ALTER instead,
  -- and `ADD COLUMN … NOT NULL` against rows that exist would abort a shared
  -- `db push`. Nullability is not a loophole: `reentry_notif_ist_day_check`
  -- below requires it on every new write, and a NULL never collides in a
  -- UNIQUE, so pre-existing rows sit outside the daily constraint rather than
  -- blocking its creation.
  ist_day text,
  -- When the rung was CLAIMED (insert time). The ≤1/day and ≤4/application caps
  -- count these, so a claim consumes budget whether or not delivery succeeded —
  -- deliberately, since the alternative is a failing sender retrying its way
  -- through an applicant's inbox.
  claimed_at timestamptz NOT NULL DEFAULT now(),
  -- Set once the sender reports success. NULL = claimed but never delivered.
  dispatched_at timestamptz,
  -- Sender invocations made against this claim, and the DEFAULT is load-bearing:
  -- a fresh claim is 0 because a claim is a RESERVATION, not a delivery attempt.
  -- The handler sets it to 1 when it has actually called the sender (success or
  -- failure alike), so 0 here means "reserved, never attempted" — the signature
  -- of a run that died between the claim and the dispatch — and is
  -- distinguishable from a rung that was genuinely tried. The handler claims
  -- once and does NOT auto-retry: releasing a claim to retry it would hand an
  -- overlapping tick a second chance to send the same message, so a failed rung
  -- stays claimed, undelivered and visible instead.
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT reentry_notif_unique UNIQUE (application_id, template_key),
  CONSTRAINT reentry_notif_daily_unique UNIQUE (application_id, ist_day)
);

-- The `IF NOT EXISTS` above means a table created by an earlier run keeps its
-- original definition, so every constraint/column added later needs its own
-- idempotent guard. Same pattern as 20260722120000_reconciled_stage_columns.sql.
--
-- `ist_day` is added WITHOUT `NOT NULL` and WITHOUT a DEFAULT, unlike `attempts`
-- beside it, and both omissions are deliberate. `NOT NULL` with no default
-- against a table that already holds rows raises 23502 and aborts the whole
-- `db push`, taking every other branch's pending migration with it. A DEFAULT
-- would fill every existing row with the SAME literal, which is worse than
-- useless here: `reentry_notif_daily_unique` would then find that literal
-- repeated for any application with two historical claims and the ADD
-- CONSTRAINT would fail instead. Backfilling from `claimed_at` has the same
-- failure mode wherever the very race this migration closes has already
-- happened. NULL is the one value that can never collide, so old rows keep it,
-- stay outside the daily constraint, and the constraint always adds cleanly.
ALTER TABLE public.reentry_notifications_log
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS ist_day text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reentry_notif_unique'
      AND conrelid = 'public.reentry_notifications_log'::regclass
  ) THEN
    ALTER TABLE public.reentry_notifications_log
      ADD CONSTRAINT reentry_notif_unique UNIQUE (application_id, template_key);
  END IF;

  -- The ≤1/day cap, as a constraint rather than as a hope about timing. See the
  -- header: the rung UNIQUE above only catches invocations that agreed on the
  -- rung, and two that disagree about the POOL do not. Adding it here rather
  -- than only in the CREATE is what makes this file re-runnable against a table
  -- an earlier `db push` already created.
  --
  -- It can never abort: `ist_day` is NULL on every row that predates it, and
  -- NULLs are distinct in a UNIQUE (the default, `NULLS DISTINCT`), so there is
  -- nothing for the index build to find a duplicate of.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reentry_notif_daily_unique'
      AND conrelid = 'public.reentry_notifications_log'::regclass
  ) THEN
    ALTER TABLE public.reentry_notifications_log
      ADD CONSTRAINT reentry_notif_daily_unique UNIQUE (application_id, ist_day);
  END IF;

  -- What keeps the nullable column honest. NOT VALID skips the existing rows —
  -- which is the entire point, since they are the ones that legitimately hold
  -- NULL — while every INSERT and UPDATE from here on is checked in full. So a
  -- writer that forgets `ist_day`, or writes it in some other shape, is refused
  -- rather than quietly landing a row that the daily UNIQUE cannot see. The
  -- pattern is `YYYY-MM-DD` because that is exactly what `istDayKey()` emits.
  --
  -- The one thing to know before hand-editing history: NOT VALID exempts old
  -- rows from the SCAN, not from later writes, so an UPDATE of a legacy
  -- NULL-`ist_day` row must set the column too. The handler never does that —
  -- `settleClaim` only ever updates a row it just inserted — so this bites
  -- nothing in the running system.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reentry_notif_ist_day_check'
      AND conrelid = 'public.reentry_notifications_log'::regclass
  ) THEN
    ALTER TABLE public.reentry_notifications_log
      ADD CONSTRAINT reentry_notif_ist_day_check
      CHECK (ist_day IS NOT NULL AND ist_day ~ '^\d{4}-\d{2}-\d{2}$') NOT VALID;
  END IF;

  -- Channel vocabulary. NOT VALID so the add is instant and never scans; new
  -- writes are still checked, which is all this needs to do.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reentry_notif_channel_check'
      AND conrelid = 'public.reentry_notifications_log'::regclass
  ) THEN
    ALTER TABLE public.reentry_notifications_log
      ADD CONSTRAINT reentry_notif_channel_check
      CHECK (channel IN ('email', 'whatsapp')) NOT VALID;
  END IF;

  -- The six rungs, enumerated. A typo in a template key would otherwise create
  -- a brand-new rung that no cap has ever seen and that the ladder would send
  -- forever, one per fresh misspelling.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reentry_notif_template_key_check'
      AND conrelid = 'public.reentry_notifications_log'::regclass
  ) THEN
    ALTER TABLE public.reentry_notifications_log
      ADD CONSTRAINT reentry_notif_template_key_check
      CHECK (template_key IN (
        'reentry_fee_nudge_1',
        'reentry_fee_nudge_2',
        'reentry_fee_nudge_3',
        'reentry_interview_nudge_1',
        'reentry_interview_nudge_2',
        'reentry_interview_nudge_3'
      )) NOT VALID;
  END IF;
END $$;

-- The cron's read pattern: "every rung this batch of applications has already
-- had", newest first.
CREATE INDEX IF NOT EXISTS reentry_notif_app_idx
  ON public.reentry_notifications_log (application_id, claimed_at DESC);

-- Claims that were never delivered — the operational signal that a sender is
-- broken. Partial, so it stays small on a healthy system.
CREATE INDEX IF NOT EXISTS reentry_notif_undelivered_idx
  ON public.reentry_notifications_log (claimed_at DESC)
  WHERE dispatched_at IS NULL;

COMMENT ON TABLE public.reentry_notifications_log IS
  'Re-entry reminder ladder idempotency ledger (PHASE RE E-1). Keyed on the APPLICATION, not the user: a recoverable applicant may have no public.users row. Two UNIQUEs make a double-send impossible across overlapping cron runs: (application_id, template_key) for the rung, and (application_id, ist_day) for the one-message-per-IST-day cap, which the engine alone cannot enforce because two invocations in different states pick keys from different pools and never collide.';
COMMENT ON COLUMN public.reentry_notifications_log.claimed_at IS
  'Insert time. The ≤1/day and ≤4/application caps count claims, not deliveries.';
COMMENT ON COLUMN public.reentry_notifications_log.ist_day IS
  'The IST calendar day (YYYY-MM-DD) this claim spends, derived by ledgerKey() in _shared/ladder.ts from the decision''s own clock — never from now(). NULL only on rows written before this column existed; reentry_notif_ist_day_check requires it on every new write.';
COMMENT ON COLUMN public.reentry_notifications_log.dispatched_at IS
  'Set when the sender reported success. NULL = claimed but never delivered.';
COMMENT ON COLUMN public.reentry_notifications_log.attempts IS
  'Sender invocations against this claim. 0 = reserved but never attempted; 1 = the sender was called exactly once. The handler never auto-retries.';

-- RLS on, admin-read only. The service-role writer bypasses RLS, so no INSERT
-- policy exists and none should: nothing but the cron may ever write a row
-- here. Precedent: cohort_notifications_log
-- (20260526210000_cohort_notification_templates.sql:81-83), narrowed from FOR
-- ALL to FOR SELECT because reading is the only thing an admin needs.
ALTER TABLE public.reentry_notifications_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reentry_notif_admin_read ON public.reentry_notifications_log;
CREATE POLICY reentry_notif_admin_read ON public.reentry_notifications_log
  FOR SELECT USING (is_admin());

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- Dropping the table takes its constraints with it. To reverse ONLY the daily
-- cap on a live ledger, without touching the rest:
--   ALTER TABLE public.reentry_notifications_log
--     DROP CONSTRAINT IF EXISTS reentry_notif_ist_day_check,
--     DROP CONSTRAINT IF EXISTS reentry_notif_daily_unique;
--   ALTER TABLE public.reentry_notifications_log DROP COLUMN IF EXISTS ist_day;
-- DROP INDEX IF EXISTS public.reentry_notif_undelivered_idx;
-- DROP INDEX IF EXISTS public.reentry_notif_app_idx;
-- DROP POLICY IF EXISTS reentry_notif_admin_read ON public.reentry_notifications_log;
-- DROP TABLE IF EXISTS public.reentry_notifications_log;
