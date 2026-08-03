# Creator Academy Edition 2 pilot

This directory owns the deterministic, reversible production pilot for the
existing `Creator Academy Edition 2` offering.

The pilot uses two existing identities. It does not create or modify auth users:

- `e35895f3-a13b-4cda-ba2d-703d4874cda9`: App Review Demo Student, the real
  member/RLS test identity.
- `614e5085-e98c-48f0-86dd-9df5f3147b39`: Rahul Srinivas, the manual room host
  and seeded-content author.

The seed creates one hidden draft course solely because `live_sessions.course_id`
is non-nullable. It does not borrow any legacy Creator Academy course, so access
and rollback stay isolated.

## Production run order

1. Complete the database backup, all cohort migrations, and the combined
   post-push release gate. The guarded R0 constraints/triggers and
   `notifications_room_unread_uniq` must all exist; `seed.sql` checks them again.
2. Keep the offering draft/private. Run `seed.sql` through a direct Postgres
   connection with stop-on-error enabled:

   ```sh
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f ops/pilot/creator-academy-edition-2/seed.sql
   ```

3. Run `verify-member-rls.sql` the same way. It opens a `READ ONLY`
   transaction, emulates the existing Demo Student JWT, proves the room RPCs
   and direct `live_sessions` RLS, and always rolls back:

   ```sh
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f ops/pilot/creator-academy-edition-2/verify-member-rls.sql
   ```

4. Sign into the shipped app as Demo Student and smoke-test:

   - My Cohorts shows `Creator Academy Edition 2 - Pilot`.
   - `/room/creator-academy-edition-2` opens as a member, not an admin.
   - Week 1 is active; Week 2 is upcoming.
   - Two sessions, one pinned announcement, one resource, one feed post, and a
     two-person roster are visible.
   - The inbox contains one room-announcement notification.

5. Add only verified real meeting/recording URLs through the admin surface.
   The seed intentionally stores no fake Zoom URL.
6. Activate/publicize the offering only after the member smoke test is green.
   `activate.sql` is a separate, observable transaction that requires the
   offering to be exactly draft/private and the deterministic room seed to be
   present:

   ```sh
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f ops/pilot/creator-academy-edition-2/activate.sql
   ```

   The result reports only the offering ID, slug, visibility state, and the
   independent `identity_spine_enabled` state. The script never changes that
   identity-spine switch.

## Idempotency check

`seed.sql` may be run twice. The second run must return the same manifest and
must not create a second enrolment, room member, notification, week, session,
announcement, resource, or post. A natural-key collision owned by another row
aborts the entire transaction.

## Visibility rollback

To remove the pilot from the public storefront while preserving all seeded
room data, run `deactivate.sql` while the offering is exactly active/public:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f ops/pilot/creator-academy-edition-2/deactivate.sql
```

This returns the offering to draft/private and deliberately leaves
`identity_spine_enabled` unchanged. Re-running either visibility script after
it has succeeded is rejected because its expected pre-state no longer holds.

## Full pilot rollback

When withdrawing seeded pilot data, first run `deactivate.sql` if the offering
is active/public. Confirm its draft/private result, then run `rollback.sql`:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f ops/pilot/creator-academy-edition-2/rollback.sql
```

The rollback is fail-closed. It refuses to run if a deterministic row is edited
or repurposed (including adding a meeting or recording URL), or after the
batch/course gains any non-seed member, session, assignment, attendance mark,
reply, demo entry, recording progress, resource, post, announcement, course
content, review, or other dependent row. It deletes only the deterministic pilot
data and preserves the now-draft/private offering plus both existing
identities. If the offering was already draft/private, do not run
`deactivate.sql` again; proceed directly to `rollback.sql`.

## Seeded schedule

The pilot fixture is intentionally small and visible immediately for the
2026-08-03 launch window:

- Week 1: 2026-08-03 through 2026-08-09, active.
- Week 2: 2026-08-10 through 2026-08-16, upcoming.
- Week 1 critique: 2026-08-08 11:00 IST.
- Week 2 studio: 2026-08-12 18:30 IST.

If business scheduling changes before the first production run, update the
dates in `seed.sql`, repeat the local seed/verify/rollback cycle, and commit the
new deterministic fixture before applying it.
