# delete-account

Required by Google Play's mandatory in-app account-deletion policy. The same
backend powers the in-app `Profile → Danger zone → Delete account` button and
is documented for users on the public `/delete-account` page.

## Endpoint

```
POST /functions/v1/delete-account
Authorization: Bearer <user JWT>
```

### Optional query parameters

| Param         | Effect                                                       |
|---------------|--------------------------------------------------------------|
| `?hard=true`  | Hard-delete immediately (skip the 7-day grace period). Caller must have `role = 'admin'` in `public.users`. Not exposed in the UI. |

### Response

```jsonc
// 200 — soft-delete succeeded
{ "status": "deleted", "recoverable_until": "2026-05-29T18:00:00.000Z" }

// 200 — caller had already requested deletion previously
{ "status": "already_deleted", "recoverable_until": "2026-05-29T18:00:00.000Z" }

// 200 — admin hard delete (no recovery)
{ "status": "deleted", "recoverable_until": null }

// 401 / 403 / 405 / 500 — { "error": "..." }
```

## What soft-delete actually does

The edge function updates `public.users` for the caller:

- `deleted_at = now()`
- `full_name = NULL`
- `email = NULL`
- `phone = NULL`
- `avatar_url = NULL`
- `bio = NULL`

Then it revokes all active refresh tokens via `auth.admin.signOut(userId, 'global')`
so any other open sessions are kicked out immediately.

The RLS policy `users_read_own` (see migration `20260522180000_account_deletion.sql`)
hides the row from the user once `deleted_at IS NOT NULL`, so on next page load the
app receives `null` from `fetchProfile()` and treats them as logged out. The
auth.users row is left intact during the grace window so the user cannot accidentally
re-register the same email and revive cascade-linked rows.

Admins (`role = 'admin'`) can still SELECT deleted rows — that's how recovery works.

## The 7-day grace period

`cleanup_deleted_users()` is the SQL function that performs the actual hard delete.
It runs as `SECURITY DEFINER` (service-role only) and:

1. Iterates every `public.users` row where `deleted_at < now() - interval '7 days'`.
2. Sets `payment_orders.user_id = NULL` so the `ON DELETE RESTRICT` FK does not
   block the cascade. Payment records are kept for ~8 years per Indian tax /
   Razorpay compliance regardless of account state.
3. Sets `refunds.initiated_by = NULL` for the same reason.
4. Deletes the matching `auth.users` row. The existing
   `auth.users → public.users` and `public.users → child tables` cascade FKs
   handle the rest (enrolments, chapter_progress, course_reviews, notifications,
   cohort_applications, certificates, wishlisted_offerings, community posts,
   chapter_qna, comments, etc.).

### Schedule the cleanup via Supabase Cron

Run **once** in the Supabase SQL editor against the production project:

```sql
SELECT cron.schedule(
  'cleanup-deleted-users-nightly',
  '30 20 * * *', -- 02:00 IST = 20:30 UTC (previous day)
  $$ SELECT public.cleanup_deleted_users(); $$
);
```

To inspect the job:

```sql
SELECT * FROM cron.job WHERE jobname = 'cleanup-deleted-users-nightly';
```

To remove it (if you ever need to redo the schedule):

```sql
SELECT cron.unschedule('cleanup-deleted-users-nightly');
```

## Recovering a soft-deleted account

Within the 7-day grace window an admin can restore an account manually:

```sql
-- Find the row (admins bypass RLS via is_admin())
SELECT id, deleted_at FROM public.users WHERE id = '<user-uuid>';

-- Recover it
UPDATE public.users
   SET deleted_at = NULL
 WHERE id = '<user-uuid>';
```

The PII columns (`email`, `full_name`, `phone`, `avatar_url`, `bio`) were
intentionally wiped during the soft-delete, so the user will need to re-enter
those after signing in. The auth.users row still holds the canonical email
address; you can grab it from there to refill `public.users.email` first:

```sql
UPDATE public.users u
   SET email = a.email,
       deleted_at = NULL
  FROM auth.users a
 WHERE u.id = a.id
   AND u.id = '<user-uuid>';
```

After the grace window expires there is no recovery — the cleanup job
hard-deletes auth.users which cascades through every child table.

## Public deletion form

The public `/delete-account` page inserts into `account_deletion_requests`
(unauthenticated, RLS-restricted policy permits anonymous INSERT with a
locked-down WITH CHECK clause). Admins review the queue in
`AdminUsers` (or directly via SQL) and process each ticket manually —
typically by emailing the requester for verification and then either
issuing the in-app `request_account_deletion()` RPC on their behalf or
performing a hard delete via `?hard=true` with their own admin JWT.
