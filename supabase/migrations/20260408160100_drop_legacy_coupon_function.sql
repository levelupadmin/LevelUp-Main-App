-- Deep sweep fix: drop the legacy non-atomic increment_coupon_usage().
-- PR #1 shipped atomic redeem_coupon() in 20260408150200. The old function
-- is still defined and grantable, meaning a compromised service role or a
-- future refactor could accidentally reintroduce the race (over-redeeming a
-- capped coupon). No caller uses it — grep confirms only the auto-generated
-- types.ts references it, and no edge function imports it.

DROP FUNCTION IF EXISTS public.increment_coupon_usage(uuid);
