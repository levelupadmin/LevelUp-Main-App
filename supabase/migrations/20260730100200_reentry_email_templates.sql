-- ============================================================
-- PHASE RE — Copy for the two re-entry nudges that have a real population (E-2)
-- ============================================================
--
-- WHY THIS FILE EXISTS AT ALL. `cohort-reentry-cron` renders from
-- `public.email_templates`, exactly like `queue-transactional-email`, and both
-- read with `.eq('template_key', …).eq('is_active', true)`. With no row the read
-- returns nothing and there is no copy to send. In the cron that is not a 404 but
-- a designed outcome: the six rung keys are handed to `decide()` as the EMAIL
-- channel's renderable set, so a key with no active row here produces
-- `{ send: false, reason: 'no-copy' }` — counted in the run summary, never
-- claimed, never dispatched. Until this migration is applied the ladder is
-- therefore mute at the database level, on top of the `REMINDER_LADDER_ENABLED`
-- kill switch and the forced dry run. THIS PHASE DOES NOT APPLY IT.
--
-- WHY ONE ROW PER RUNG AND NOT ONE PER POOL. The ledger's UNIQUE is
-- `(application_id, template_key)` (20260730100000_reentry_ledger.sql), so the
-- key IS the rung. One key per pool would permit exactly one send per pool
-- forever and the ≤4-per-application cap could never be reached. The six keys
-- are fixed in three places that must agree — `LADDERS` in
-- `supabase/functions/_shared/ladder.ts`, the `reentry_notif_template_key_check`
-- CHECK on the ledger, and this seed — and `src/lib/__tests__/ladder.nudges.test.ts`
-- asserts all three agree.
--
-- ── THE COPY, AND THE TWO STRINGS THAT WERE AMENDED ────────────────────────
-- The hero line of each pool is the approved deck copy, verbatim except for
-- punctuation:
--
--   CD-03-LAD-04  (design/cohorts/docs/07-COPY-DECK.md, "Completed-form,
--                 fee-not-paid ladder"). Deck text joins its two clauses with an
--                 em dash. Em dashes are banned in all LevelUp-facing copy, so
--                 the dash is a full stop. No word changed, no meaning changed:
--                 "You're one tap from applying. Complete the ₹{{app_fee}} step
--                 and your application goes to the admissions team."
--   CD-03-LAD-05  Same amendment, same rule:
--                 "You've paid. Now book your interview. Slots are open this week."
--
-- The deck must be updated to match; both amendments are flagged in the E-2
-- handover.
--
-- WHY THE FEE AMOUNT IS A RENDER TOKEN AND NOT THE LITERAL "₹400". The deck
-- writes ₹400 because that is this cohort's fee, but `offerings.app_fee_inr` is
-- per-offering and other LevelUp SKUs charge a different application fee.
-- Mailing "₹400" to an applicant whose fee is not 400 is a factual error, which
-- is worse than a render token — and the deck already establishes the pattern
-- (WORD-2: "`[time]` is a render token"). For a ₹400 offering `{{app_fee}}`
-- renders the deck line byte for byte. When `app_fee_inr` is NULL or ≤ 0 the
-- cron marks the fee rungs unrenderable rather than inventing a number.
--
-- The deadline sentence is `CD-04-DRAFT-04` ("Applications for this cohort close
-- [date]."), reused rather than newly written, and it is rendered as a DATE
-- because `offerings.application_deadline` is a `date` column with no
-- time-of-day and cannot defend a wall-clock time (WORD-2 again). The cron
-- passes an empty `{{deadline_line}}` when the column is NULL or already past,
-- so the claim is never made without data behind it.
--
-- NFR-COPY-1: the 100-word essay is NEVER surfaced. It lives in
-- `cohort_applications.bio` AND raw inside `tally_data`, and NEITHER column is
-- selected by the cron, so no placeholder here can reach it. Every variable
-- below is a structured field: first name, cohort title, fee amount, deadline
-- date, and two links that already exist.
--
-- INTEG-PAY-1: `{{fee_link}}` is the EXISTING in-app checkout route the
-- application surface already offers for this stage
-- (`/checkout/{offering_id}?type=app_fee&app={application_id}`, see
-- `src/pages/ApplicationStatus.tsx` RECONCILED_STAGE_UI['completed-no-fee']),
-- and `{{calendly_link}}` is the EXISTING `offerings.calendly_url`. Nothing here
-- originates an order or inserts into the intake chain.
--
-- Additive, idempotent and re-runnable, following
-- 20260526210000_cohort_notification_templates.sql exactly: INSERT … ON CONFLICT
-- (template_key) DO UPDATE. It contains NO `RAISE EXCEPTION` — a shared
-- `db push` runs every pending migration and this one must never be the reason
-- another branch's migration fails to apply.
--
-- ── ONE OPEN ITEM, RECORDED RATHER THAN PAPERED OVER ───────────────────────
-- There is no unsubscribe endpoint in this repo (`email_unsubscribe_tokens`
-- exists but no producer issues a token and `_shared/email.ts`'s `enqueueEmail`
-- takes no `unsubscribe_token`, and that file is not E-2's to change). These are
-- service messages to someone who submitted an application, `user_marketing_prefs`
-- holds zero rows, so no consent is claimed. Every body below therefore says why
-- the mail arrived and offers the one opt-out that provably works today: a
-- reply, which a human puts into `suppressed_emails` and which then silences the
-- ladder through its own suppression check.

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
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.

{{fee_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"app_fee","label":"Application fee (INR)"},{"key":"fee_link","label":"Existing in-app application-fee checkout link"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"}]',
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
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.

{{fee_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"app_fee","label":"Application fee (INR)"},{"key":"fee_link","label":"Existing in-app application-fee checkout link"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"}]',
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
<p style="color:#666;font-size:13px;">This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You're one tap from applying. Complete the ₹{{app_fee}} step and your application goes to the admissions team.

{{fee_link}}

{{deadline_line}}

This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"app_fee","label":"Application fee (INR)"},{"key":"fee_link","label":"Existing in-app application-fee checkout link"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"}]',
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
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You've paid. Now book your interview. Slots are open this week.

{{calendly_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"calendly_link","label":"Existing offerings.calendly_url"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"}]',
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
<p style="color:#666;font-size:13px;">You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You've paid. Now book your interview. Slots are open this week.

{{calendly_link}}

{{deadline_line}}

You are getting this because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"calendly_link","label":"Existing offerings.calendly_url"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"}]',
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
<p style="color:#666;font-size:13px;">This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.</p>
<p>LevelUp Learning</p>$$,
    $$Hi {{first_name}},

You've paid. Now book your interview. Slots are open this week.

{{calendly_link}}

{{deadline_line}}

This is the last reminder we will send about this step. You are getting it because you applied to {{cohort_name}} on LevelUp Learning. Reply to this email and we will stop these reminders.

LevelUp Learning$$,
    '[{"key":"first_name","label":"Applicant first name"},{"key":"cohort_name","label":"Offering title"},{"key":"calendly_link","label":"Existing offerings.calendly_url"},{"key":"deadline_line","label":"Deadline sentence, or empty when there is no future deadline"}]',
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
-- Deactivating is the safe undo — it makes every rung unrenderable, so the cron
-- reports `no-copy` and sends nothing, without losing the copy itself.
-- UPDATE public.email_templates SET is_active = false
--  WHERE template_key IN (
--    'reentry_fee_nudge_1','reentry_fee_nudge_2','reentry_fee_nudge_3',
--    'reentry_interview_nudge_1','reentry_interview_nudge_2','reentry_interview_nudge_3');
-- DELETE FROM public.email_templates WHERE template_key LIKE 'reentry\_%';
