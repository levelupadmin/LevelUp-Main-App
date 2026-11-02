-- "The Breakthrough Filmmakers' Program — Batch 21" is a live-cohort batch
-- (granted by admins, priced 0) but was tagged product_tier 'other', so the
-- free-enrolment gate in _shared/freeEnrolment.ts would not have caught it.
-- Guarded: only touches the row while it still has the old tier and price 0.
update public.offerings
   set product_tier = 'live_cohort'
 where id = '260c3c41-3828-47aa-ae85-e81b98be97d9'
   and product_tier = 'other'
   and coalesce(price_inr, 0) = 0;
