-- Only the server writes payment_orders.
--
-- Policy payment_orders_insert_own (20260405063223) let any signed-in user
-- insert a payment_orders row with any columns, as long as user_id was their
-- own. The status check allows 'captured'. verify-razorpay-payment's
-- already-captured branch then granted the course from the row alone, so a
-- made-up "captured" row plus one verify call would likely have unlocked a
-- paid course without paying. Untested; on 30 Oct 2026 all 242 captured paid
-- orders had real Razorpay ids, so nothing suggests it was used.
--
-- No browser code writes this table: the app only reads it (ThankYou,
-- ProfilePage, useReviews, AdminRevenue, AdminCoupons, AdminAnalytics). Every
-- write comes from edge functions with the service role, which RLS and these
-- grants do not touch, or from SECURITY DEFINER functions
-- (cleanup_deleted_users), which run as the table owner.
--
-- The SELECT policies (payment_orders_own, and the read side of
-- payment_orders_admin) stay. payment_orders_admin is FOR ALL; after this its
-- write side is unreachable from the browser, which matches what the admin
-- pages do today.
--
-- Undo (re-opens the hole; only if a browser write turns out to be needed):
--   grant insert, update, delete on public.payment_orders to authenticated;
--   create policy payment_orders_insert_own on public.payment_orders
--     for insert with check (auth.uid() = user_id);

drop policy if exists payment_orders_insert_own on public.payment_orders;

revoke insert, update, delete, truncate on public.payment_orders from anon, authenticated;
