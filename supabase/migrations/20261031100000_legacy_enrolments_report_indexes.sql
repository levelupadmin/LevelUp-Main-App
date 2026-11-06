-- Stage 2 of the backend plan: indexes for the admin reports and the login lookup.
--
-- legacy_enrolments has 83,718 rows and, until now, no index on the columns the
-- reports filter on, so every dashboard load scanned the whole table several
-- times. verify-msg91-otp looks rows up by phone without the
-- "claimed_by_user_id IS NULL" filter, so it could not use the partial phone
-- index either (234 ms per sign-in).
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction. Run each statement
-- on its own (psql, or one statement per SQL editor run). Writes to the table
-- keep working while each index builds.

create index concurrently if not exists legacy_enrolments_phone_idx
  on public.legacy_enrolments (phone);

-- The extra columns let the window counts (distinct buyers, part-day totals)
-- read the index alone.
create index concurrently if not exists legacy_enrolments_purchased_at_idx
  on public.legacy_enrolments (legacy_purchased_at) include (phone, legacy_amount_inr, offering_id);

create index concurrently if not exists legacy_enrolments_offering_id_idx
  on public.legacy_enrolments (offering_id);
