-- ============================================================
-- PHASE RE — One-click unsubscribe: hashed tokens + the copy that links to it (U-1)
-- ============================================================
--
-- Two things, and they must land together. The schema that lets
-- `public.email_unsubscribe_tokens` hold a HASHED token, and the six re-entry
-- email bodies re-stated so they carry the link instead of asking the reader to
-- reply. Splitting them would leave either a table nothing writes or copy
-- pointing at a column that does not exist.
--
-- ── WHAT WAS ALREADY THERE, AND WHY IT FIGHTS "STORE HASHED" ────────────────
-- `20260407192559_email_infra.sql:238` created the table as
--   token TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, created_at, used_at
-- i.e. a PLAINTEXT token column, NOT NULL, one row per address. Nothing has
-- ever written a row (grep across src/, supabase/ and scripts/ finds no
-- producer and no consumer other than this task's), so the table is empty and
-- the constraint is the only obstacle.
--
-- THE CHOICE, MADE DELIBERATELY: add `token_hash` and relax `token` to
-- NULLABLE, rather than storing the hash inside the column named `token`.
-- Storing a hash in a column called `token` costs no schema churn and was the
-- other real option, but it leaves the database asserting something false about
-- its own contents, and the next person to read this table would reasonably
-- believe they were looking at a value they could put in a link. The ALTER is
-- additive, idempotent and reversible; the only irreversible-in-practice part
-- is re-imposing NOT NULL on `token`, which needs the column to be non-NULL
-- everywhere, so the reversal at the foot says so instead of pretending.
--
-- `token` is left in place, never written, and never read. Any legacy plaintext
-- value in it is therefore INERT: `email-unsubscribe` verifies by hashing what
-- it was handed and matching `token_hash`, so a value in `token` authorises
-- nothing.
--
-- ── WHY A SEPARATE `issued_at` AND NOT A REUSED `created_at` ────────────────
-- The token is derived (see `supabase/functions/_shared/unsubscribe.ts`):
--     token = base64url(HMAC-SHA256(secret, 'v1:<row id>:<issued_at>'))
-- so ROTATING a token means moving its issue time. Doing that to `created_at`
-- would destroy the record of when the address first entered the table, which
-- is the one thing that column is for. `issued_at` carries the derivation
-- input; `created_at` stays honest.
--
-- `issued_at` IS AN HMAC INPUT, WHICH MAKES ITS TEXT RENDERING LOAD-BEARING.
-- The sender writes it as a JS `toISOString()` string and reads it back as
-- PostgREST's rendering of a `timestamptz`, and those differ: `+00:00` instead
-- of `Z`, trailing fraction zeros dropped, no fraction at all when it is zero,
-- and MICROSECONDS on any row that took the DEFAULT `now()` below rather than
-- an explicit value. Same instant, different string, different token. The
-- derivation therefore canonicalises the instant before hashing it, and the
-- sender re-hashes what it derived and compares it to `token_hash` before
-- putting the link in an email; a mismatch rotates the row. That is why the
-- DEFAULT here is a safety net for a legacy row and not the normal path: rows
-- this design writes always carry an explicit millisecond-precision value.
--
-- ── WHY THE TOKEN IS DERIVED AND NOT RANDOM (the short version) ─────────────
-- One row per address plus hash-only storage means the plaintext cannot be read
-- back for the next send. A per-send random token would therefore invalidate
-- every link already sitting in a delivered email, and a person clicking last
-- week's message would be told they are unsubscribed and would not be. An HMAC
-- over the row is reproducible without being stored: all four rungs of a ladder
-- carry the same working link, while this table still holds only sha256(token),
-- so a read of THIS TABLE cannot forge an opt-out. That is the whole of the
-- claim, deliberately: the rendered body and the pgmq `transactional_emails`
-- payload do carry the live link, and `move_to_dlq` retains that payload
-- indefinitely for a message that failed to send, so a service-role read of the
-- DLQ yields working credentials. Full reasoning lives in
-- `_shared/unsubscribe.ts`.
--
-- ── `used_at` IS THE OPT-OUT RECORD, AND NEVER A GATE AT THE ENDPOINT ──────
-- One column, two honest jobs:
--   • it answers "when did this person first ask us to stop", and
--   • it is the flag `cohort-reentry-cron` reads (per page in
--     `loadOptedOutEmails`, and again per dispatch) to stop sending.
-- It is NOT consulted by `email-unsubscribe` to decide whether to honour a
-- click: the endpoint must be idempotent, so a second click finds it already
-- set, writes nothing and still reports success.
-- It is NEVER CLEARED by a rotation, and a row that has it set is not rotated at
-- all. Clearing it would resurrect somebody who had asked us to stop; an
-- opted-out address is never mailed again, so it has nothing to rotate for.
-- Support clearing it deliberately (the table carries a service-role UPDATE
-- policy) is the ONLY way an opt-out is undone, which is what makes the "write
-- to support" line on the confirmation page an offer rather than a platitude.
--
-- ── WHY THE OPT-OUT LIVES HERE AND NOT IN `suppressed_emails` ──────────────
-- `public.suppressed_emails` is one undifferentiated list with no category
-- column, and `queue-transactional-email` hard-gates EVERY transactional send
-- on it (returning a 200 "Email suppressed", so callers never learn the mail was
-- dropped) — including `payment_receipt` from `verify-razorpay-payment` and the
-- `notify-cohort` sends. It is also append-only by DDL: "no DELETE or UPDATE
-- policies to prevent bypassing suppression". So an unsubscribe written there
-- would mean one click on a fee reminder silently and PERMANENTLY killed that
-- applicant's payment receipt as well, with no way back. The six bodies below
-- promise to stop "these reminders"; `used_at` on this table stops exactly
-- those, and stops them reversibly. Somebody who wants all mail to stop still
-- has the reply path, which a human turns into a `suppressed_emails` row.
--
-- THE PRICE OF THAT, NAMED: `send-bulk-email` is a second producer and reads
-- only `suppressed_emails`, so an opt-out recorded here does NOT stop a bulk
-- campaign. The endpoint's pages say so and point at support. Making a reminder
-- opt-out suppress marketing too needs either a category column on
-- `suppressed_emails` or a second list, and it is a product decision, so it is
-- flagged rather than taken here.
--
-- ── ADDRESSES IN THIS TABLE ARE CANONICAL (lower-cased, trimmed) ───────────
-- One producer writes it (`cohort-reentry-cron`, through
-- `normalizeUnsubscribeEmail`), so unlike `suppressed_emails` — written by
-- humans and by bounce handling, hence read with `ilike` — this one can be kept
-- normalised at the door. That buys an exact `.in()` read against the existing
-- `UNIQUE(email)` index, and stops one person acquiring two token rows, and so
-- two opt-out states, because two application forms spelled their address
-- differently.
--
-- ── RLS IS NOT WEAKENED HERE ───────────────────────────────────────────────
-- The table already has RLS ENABLED with service-role-only SELECT / INSERT /
-- UPDATE and NO DELETE policy. This migration adds no policy, drops no policy
-- and grants nothing: anon still cannot read a token row, and the endpoint gets
-- at it with the service-role key, which bypasses RLS. The `ENABLE ROW LEVEL
-- SECURITY` below is a re-assertion, not a change.
--
-- Additive, idempotent, re-runnable and reversible. It contains NO
-- `RAISE EXCEPTION`: a shared `db push` runs every pending migration and this
-- one must never be the reason another branch's migration fails to apply. The
-- table guard below degrades to a NOTICE for the same reason.

-- EVERY table-dependent statement sits inside this one guard, deliberately. A
-- half-guarded migration is worse than an unguarded one: it would skip the
-- ALTERs on a database without the table and then abort on the very next
-- COMMENT. `RAISE NOTICE` and not `RAISE EXCEPTION`, so a shared `db push`
-- carries on.
DO $$
BEGIN
  IF to_regclass('public.email_unsubscribe_tokens') IS NULL THEN
    RAISE NOTICE 'public.email_unsubscribe_tokens is absent; skipping the unsubscribe-token schema changes';
    RETURN;
  END IF;

  -- sha256(token), lowercase hex. The ONLY thing ever compared at verify time.
  EXECUTE 'ALTER TABLE public.email_unsubscribe_tokens ADD COLUMN IF NOT EXISTS token_hash text';

  -- The derivation input, and what rotation moves.
  EXECUTE 'ALTER TABLE public.email_unsubscribe_tokens ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT now()';

  -- Nothing writes the plaintext column any more, so its NOT NULL would reject
  -- every row this design creates. A no-op when it is already nullable.
  EXECUTE 'ALTER TABLE public.email_unsubscribe_tokens ALTER COLUMN token DROP NOT NULL';

  -- One row per hash. PARTIAL so any legacy row with a NULL `token_hash` does
  -- not collide with another (a plain UNIQUE would tolerate that too, but
  -- stating the predicate makes the intent explicit and keeps the index off
  -- dead rows).
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS email_unsub_tokens_token_hash_key '
       || 'ON public.email_unsubscribe_tokens (token_hash) WHERE token_hash IS NOT NULL';

  -- Re-asserted, not changed. Already enabled by 20260407192559_email_infra.sql,
  -- which also carries the service-role-only SELECT/INSERT/UPDATE policies and
  -- no DELETE policy. Nothing here loosens any of that.
  EXECUTE 'ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY';

  EXECUTE $c$COMMENT ON COLUMN public.email_unsubscribe_tokens.token_hash IS
    'sha256(token) as lowercase hex. The token itself is NEVER stored here: it is derived as base64url(HMAC-SHA256(UNSUBSCRIBE_TOKEN_SECRET, ''v1:<id>:<issued_at>'')) by cohort-reentry-cron and verified by hashing what the link presents. Scope of the guarantee, stated narrowly on purpose: a read of THIS TABLE cannot forge an unsubscribe. The live link does exist elsewhere in this database, inside the rendered body and the unsubscribe_token field of the pgmq transactional_emails payload, which move_to_dlq retains indefinitely for a message that failed to send.'$c$;
  EXECUTE $c$COMMENT ON COLUMN public.email_unsubscribe_tokens.issued_at IS
    'When the CURRENT token was derived. Part of the HMAC message, so moving it rotates the token, and its TEXT rendering is load-bearing: the derivation canonicalises the instant (to millisecond ISO-8601 with a Z) because a JS toISOString() write and a PostgREST timestamptz read of the same instant are different strings. Rotation happens on the next send once this is older than UNSUBSCRIBE_TTL_MS (180 days), or whenever the re-derived token stops matching token_hash (a secret rotation, or any derivation divergence), and never for a row whose used_at is set. The DEFAULT now() is a net for a legacy row: rows this design writes carry an explicit millisecond-precision value.'$c$;
  EXECUTE $c$COMMENT ON COLUMN public.email_unsubscribe_tokens.token IS
    'LEGACY plaintext column, no longer written or read; verification is by token_hash only, so any value here is inert. Kept nullable rather than dropped so the change stays reversible.'$c$;
  EXECUTE $c$COMMENT ON COLUMN public.email_unsubscribe_tokens.used_at IS
    'When this address opted out of the re-entry reminder ladder. Two jobs: the record of when they first asked, and the flag cohort-reentry-cron reads to stop sending. Never a gate at the endpoint, which must stay idempotent (a second click writes nothing and still reports success), and NEVER cleared by rotation. Clearing it by hand is the supported way to undo an opt-out. It does NOT suppress any other email: this is deliberately not a suppressed_emails row, which would also have killed the same person''s payment receipts irreversibly.'$c$;
  EXECUTE $c$COMMENT ON COLUMN public.email_unsubscribe_tokens.email IS
    'Canonical (trimmed, lower-cased) address. One producer writes this table, so it is normalised at the door and read with an exact match against UNIQUE(email) rather than case-insensitively like suppressed_emails.'$c$;
END $$;

-- ============================================================
-- THE COPY — the six re-entry bodies, re-stated with a real opt-out
-- ============================================================
--
-- WHY THESE ROWS ARE RE-UPSERTED HERE RATHER THAN EDITED IN PLACE.
-- `20260730100200_reentry_email_templates.sql` is committed and a shared
-- `db push` may already have applied it on another branch's run, so editing it
-- would be a change that never reaches a database that has seen it. Re-stating
-- the rows through the same `ON CONFLICT (template_key) DO UPDATE` idiom that
-- file uses reaches both cases: a fresh database applies 100200 then this, an
-- already-migrated one applies only this, and either way the six rows end up
-- identical.
--
-- WHAT CHANGED, AND ONLY THIS. Every body ended with "Reply to this email and
-- we will stop these reminders." That sentence was the honest description of
-- the only opt-out that existed. It is replaced by `{{unsubscribe_url}}`, which
-- `cohort-reentry-cron` fills per recipient with a link to the public
-- `email-unsubscribe` function. Both `html_body` and `text_body` are updated:
-- a text-only client is exactly where a stripped-down inbox reads this, and an
-- opt-out that only exists in the HTML part is not an opt-out.
--
-- The consent sentence is UNCHANGED. `user_marketing_prefs` still holds zero
-- rows, these are still service messages to someone who submitted an
-- application, and "You are getting this because you applied to
-- {{cohort_name}}" is still the true reason the mail arrived.
--
-- `variables` is updated for consistency. Nothing validates against it today
-- (the cron selects only template_key/subject/html_body/text_body), so it is
-- documentation, but documentation that lies is worse than none.
--
-- TWO COUPLINGS THAT MAKE THIS FILE UNSAFE TO CHANGE ALONE, recorded because
-- both fail silently in opposite directions:
--   1. `{{unsubscribe_url}}` MUST be in the cron's `templateVariables` map. An
--      unfilled placeholder trips `UNRESOLVED_PLACEHOLDER` AFTER the ledger
--      claim, so the rung is spent, `last_error` is written and nothing is
--      sent. Adding the token to the copy without the variable does not degrade
--      the ladder, it takes it dark.
--   2. `unsubscribe_url` MUST be in the cron's `URL_VARIABLES` set. Every other
--      variable goes through `sanitizeVar`, which strips `https?://\S+`
--      wholesale, so a URL outside that set is DELETED from the body and the
--      mail promises an opt-out it does not contain.
-- `src/lib/__tests__/unsubscribe.test.ts` asserts this file and that one agree.
--
-- No em dashes in any body (LevelUp copy rule).

INSERT INTO public.email_templates (template_key, name, subject, html_body, text_body, variables, is_active)
VALUES
  -- ── Fee ladder — reconciled stage 'completed-no-fee' (CD-03-LAD-04) ────────
  (
    'reentry_fee_nudge_1',
    'Re-entry: application fee due (touch 1, T+2h)',
    $$Your {{cohort_name}} application: one step left$$,
    $$<p>Hi {{first_name}},</p>
<p>You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.</p>
<p><a href="{{fee_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Complete the ₹{{app_fee}} step</a></p>
<p>Or open this link: {{fee_link}}</p>
<p style="color:#666;font-size:13px;">{{deadline_line}}</p>
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. <a href="{{unsubscribe_url}}" style="color:#666;">Unsubscribe from these reminders</a>.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.

{{fee_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. To stop these reminders, open this link: {{unsubscribe_url}}

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"app_fee","label":"Application fee (INR)"},{"key":"fee_link","label":"Existing in-app application-fee checkout link"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"},{"key":"unsubscribe_url","label":"Per-recipient one-click unsubscribe link (email-unsubscribe edge function)"}]',
    true
  ),
  (
    'reentry_fee_nudge_2',
    'Re-entry: application fee due (touch 2, T+26h)',
    $$Still open: the ₹{{app_fee}} step on your {{cohort_name}} application$$,
    $$<p>Hi {{first_name}},</p>
<p>You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.</p>
<p><a href="{{fee_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Complete the ₹{{app_fee}} step</a></p>
<p>Or open this link: {{fee_link}}</p>
<p style="color:#666;font-size:13px;">{{deadline_line}}</p>
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. <a href="{{unsubscribe_url}}" style="color:#666;">Unsubscribe from these reminders</a>.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.

{{fee_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. To stop these reminders, open this link: {{unsubscribe_url}}

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"app_fee","label":"Application fee (INR)"},{"key":"fee_link","label":"Existing in-app application-fee checkout link"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"},{"key":"unsubscribe_url","label":"Per-recipient one-click unsubscribe link (email-unsubscribe edge function)"}]',
    true
  ),
  (
    'reentry_fee_nudge_3',
    'Re-entry: application fee due (touch 3, T+74h, last)',
    $$Last reminder: the ₹{{app_fee}} step on your {{cohort_name}} application$$,
    $$<p>Hi {{first_name}},</p>
<p>You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.</p>
<p><a href="{{fee_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Complete the ₹{{app_fee}} step</a></p>
<p>Or open this link: {{fee_link}}</p>
<p style="color:#666;font-size:13px;">{{deadline_line}}</p>
<p style="color:#666;font-size:13px;">This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. <a href="{{unsubscribe_url}}" style="color:#666;">Unsubscribe from these reminders</a>.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.

{{fee_link}}

{{deadline_line}}

This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. To stop these reminders, open this link: {{unsubscribe_url}}

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"app_fee","label":"Application fee (INR)"},{"key":"fee_link","label":"Existing in-app application-fee checkout link"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"},{"key":"unsubscribe_url","label":"Per-recipient one-click unsubscribe link (email-unsubscribe edge function)"}]',
    true
  ),

  -- ── Interview ladder — reconciled stage 'fee-paid-no-interview' (CD-03-LAD-05)
  (
    'reentry_interview_nudge_1',
    'Re-entry: interview unbooked (touch 1, T+2h)',
    $$Book your {{cohort_name}} interview$$,
    $$<p>Hi {{first_name}},</p>
<p>You've paid. Now book your interview. Slots are open this week.</p>
<p><a href="{{calendly_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Book my interview</a></p>
<p>Or open this link: {{calendly_link}}</p>
<p style="color:#666;font-size:13px;">{{deadline_line}}</p>
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. <a href="{{unsubscribe_url}}" style="color:#666;">Unsubscribe from these reminders</a>.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You've paid. Now book your interview. Slots are open this week.

{{calendly_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. To stop these reminders, open this link: {{unsubscribe_url}}

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"calendly_link","label":"Existing offerings.calendly_url"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"},{"key":"unsubscribe_url","label":"Per-recipient one-click unsubscribe link (email-unsubscribe edge function)"}]',
    true
  ),
  (
    'reentry_interview_nudge_2',
    'Re-entry: interview unbooked (touch 2, T+26h)',
    $$Your {{cohort_name}} interview slot is still unbooked$$,
    $$<p>Hi {{first_name}},</p>
<p>You've paid. Now book your interview. Slots are open this week.</p>
<p><a href="{{calendly_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Book my interview</a></p>
<p>Or open this link: {{calendly_link}}</p>
<p style="color:#666;font-size:13px;">{{deadline_line}}</p>
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. <a href="{{unsubscribe_url}}" style="color:#666;">Unsubscribe from these reminders</a>.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You've paid. Now book your interview. Slots are open this week.

{{calendly_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. To stop these reminders, open this link: {{unsubscribe_url}}

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"calendly_link","label":"Existing offerings.calendly_url"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"},{"key":"unsubscribe_url","label":"Per-recipient one-click unsubscribe link (email-unsubscribe edge function)"}]',
    true
  ),
  (
    'reentry_interview_nudge_3',
    'Re-entry: interview unbooked (touch 3, T+74h, last)',
    $$Last reminder: book your {{cohort_name}} interview$$,
    $$<p>Hi {{first_name}},</p>
<p>You've paid. Now book your interview. Slots are open this week.</p>
<p><a href="{{calendly_link}}" style="display:inline-block;background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;font-weight:600;text-decoration:none;">Book my interview</a></p>
<p>Or open this link: {{calendly_link}}</p>
<p style="color:#666;font-size:13px;">{{deadline_line}}</p>
<p style="color:#666;font-size:13px;">This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. <a href="{{unsubscribe_url}}" style="color:#666;">Unsubscribe from these reminders</a>.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You've paid. Now book your interview. Slots are open this week.

{{calendly_link}}

{{deadline_line}}

This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. To stop these reminders, open this link: {{unsubscribe_url}}

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"calendly_link","label":"Existing offerings.calendly_url"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"},{"key":"unsubscribe_url","label":"Per-recipient one-click unsubscribe link (email-unsubscribe edge function)"}]',
    true
  )
ON CONFLICT (template_key) DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  html_body = EXCLUDED.html_body,
  text_body = EXCLUDED.text_body,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- The copy reverts by re-running 20260730100200_reentry_email_templates.sql,
-- which restates the same six rows with the reply-to-us opt-out.
--
-- DROP INDEX IF EXISTS public.email_unsub_tokens_token_hash_key;
-- ALTER TABLE public.email_unsubscribe_tokens DROP COLUMN IF EXISTS token_hash;
-- ALTER TABLE public.email_unsubscribe_tokens DROP COLUMN IF EXISTS issued_at;
-- Re-imposing the original NOT NULL only succeeds if every row has a plaintext
-- `token`, which rows minted by this design do not. Delete them first, or leave
-- the column nullable:
--   DELETE FROM public.email_unsubscribe_tokens WHERE token IS NULL;
--   ALTER TABLE public.email_unsubscribe_tokens ALTER COLUMN token SET NOT NULL;
