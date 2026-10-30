-- Stage 2 of the backend plan, item 6: stop handing out paid video URLs.
--
-- Policy chapters_read_public_offering (20260523010000) let anon and every
-- signed-in user read the WHOLE row of every chapter in a public, active
-- offering, media_url and embed_url included. For HLS, Vimeo and YouTube
-- lessons that URL is the paid video itself. The sales page needs only the
-- outline.
--
-- chapters_public serves that outline: the same rows the policy allowed, and
-- only these columns. It runs as its owner (security_invoker = false), like
-- quiz_options_public, so it reads chapters past RLS; the WHERE clause is the
-- old policy's test, word for word.
--
-- Nobody who can open a lesson loses a row: buyers keep chapters_read_enrolled
-- (which has_course_access implies), free chapters stay readable to every
-- signed-in user, and admins keep chapters_admin. Free previews on the sales
-- page play through get-vdocipher-otp, which reads with the service role.
--
-- Ship the app change first: src/lib/chapterOutline.ts reads both chapters
-- and chapters_public, and ignores the view until it exists.

create or replace view public.chapters_public
with (security_invoker = false) as
select ch.id,
       ch.section_id,
       ch.title,
       ch.description,
       ch.duration_seconds,
       ch.make_free,
       ch.sort_order,
       ch.content_type,
       ch.thumbnail_url,
       ch.vdocipher_thumbnail_url
from public.chapters ch
where exists (
  select 1
  from public.sections s
  join public.offering_courses oc on oc.course_id = s.course_id
  join public.offerings o on o.id = oc.offering_id
  where s.id = ch.section_id
    and o.is_public = true
    and o.status = 'active'
);

revoke all on public.chapters_public from anon, authenticated;
grant select on public.chapters_public to anon, authenticated;

drop policy if exists chapters_read_public_offering on public.chapters;
