-- Deleting an offering, course, cohort batch, cohort week or lesson used to
-- cascade away history nobody can get back: TagMango purchases
-- (legacy_enrolments.offering_id ON DELETE CASCADE), applications, issued
-- certificates, student progress, reviews, submissions and attendance. The
-- only guard was a check in the admin's browser (admin audit 2026-11-02).
--
-- These BEFORE DELETE triggers refuse the delete while such history exists and
-- say what to do instead. Things nobody has used yet (a draft offering, an
-- empty course, a batch with no members or work) still delete normally.
--
-- Deliberate cleanup by an engineer: inside one transaction,
--   set local levelup.allow_history_delete = 'on';
-- then delete. Nothing in the app sets it.

create or replace function public.history_delete_override()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('levelup.allow_history_delete', true), '') = 'on'
$$;

-- ── Offerings ────────────────────────────────────────────────────────────
create or replace function public.guard_offering_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrolments int;
  v_legacy int;
  v_orders int;
  v_applications int;
  v_members int;
begin
  if public.history_delete_override() then
    return old;
  end if;
  select count(*) into v_enrolments from enrolments where offering_id = old.id;
  select count(*) into v_legacy from legacy_enrolments where offering_id = old.id;
  select count(*) into v_orders from payment_orders where offering_id = old.id;
  select count(*) into v_applications from cohort_applications where offering_id = old.id;
  select count(*) into v_members
    from cohort_batch_members m join cohort_batches b on b.id = m.batch_id
   where b.offering_id = old.id;
  if v_enrolments + v_legacy + v_orders + v_applications + v_members > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'This offering can''t be deleted: it has %s enrolments, %s TagMango purchases, %s orders, %s applications and %s batch members. Archive it instead.',
        v_enrolments, v_legacy, v_orders, v_applications, v_members);
  end if;
  return old;
end;
$$;

drop trigger if exists guard_offering_delete on public.offerings;
create trigger guard_offering_delete
  before delete on public.offerings
  for each row execute function public.guard_offering_delete();

-- ── Courses ──────────────────────────────────────────────────────────────
create or replace function public.guard_course_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_students int;
  v_progress int;
  v_certificates int;
  v_reviews int;
begin
  if public.history_delete_override() then
    return old;
  end if;
  select count(distinct e.user_id) into v_students
    from enrolments e join offering_courses oc on oc.offering_id = e.offering_id
   where oc.course_id = old.id and e.status = 'active';
  select count(*) into v_progress from chapter_progress where course_id = old.id;
  select count(*) into v_certificates from certificates where course_id = old.id;
  select count(*) into v_reviews from course_reviews where course_id = old.id;
  if v_students + v_progress + v_certificates + v_reviews > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'This course can''t be deleted: %s students have access, with %s lesson-progress records, %s certificates and %s reviews. Archive it instead.',
        v_students, v_progress, v_certificates, v_reviews);
  end if;
  return old;
end;
$$;

drop trigger if exists guard_course_delete on public.courses;
create trigger guard_course_delete
  before delete on public.courses
  for each row execute function public.guard_course_delete();

-- ── Lessons (chapters): student work only ────────────────────────────────
-- Progress alone does not block (the curriculum screen asks first); a
-- student's own submissions, questions and notes do.
create or replace function public.guard_chapter_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work int;
begin
  if public.history_delete_override() then
    return old;
  end if;
  select (select count(*) from assignment_submissions where chapter_id = old.id)
       + (select count(*) from chapter_qna where chapter_id = old.id)
       + (select count(*) from chapter_notes where chapter_id = old.id)
    into v_work;
  if v_work > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'The lesson "%s" can''t be deleted: students have %s submissions, questions or notes on it. Replace its video or file instead.',
        old.title, v_work);
  end if;
  return old;
end;
$$;

drop trigger if exists guard_chapter_delete on public.chapters;
create trigger guard_chapter_delete
  before delete on public.chapters
  for each row execute function public.guard_chapter_delete();

-- ── Cohort batches ───────────────────────────────────────────────────────
create or replace function public.guard_cohort_batch_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members int;
  v_submissions int;
  v_attendance int;
  v_posts int;
begin
  if public.history_delete_override() then
    return old;
  end if;
  select count(*) into v_members from cohort_batch_members where batch_id = old.id;
  select count(*) into v_submissions
    from cohort_week_submissions s join cohort_weeks w on w.id = s.cohort_week_id
   where w.cohort_batch_id = old.id;
  select count(*) into v_attendance
    from cohort_week_attendance a join cohort_weeks w on w.id = a.cohort_week_id
   where w.cohort_batch_id = old.id;
  select count(*) into v_posts from cohort_room_posts where batch_id = old.id;
  if v_members + v_submissions + v_attendance + v_posts > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'This batch can''t be deleted: it has %s members, %s submissions, %s attendance marks and %s room posts.',
        v_members, v_submissions, v_attendance, v_posts);
  end if;
  return old;
end;
$$;

drop trigger if exists guard_cohort_batch_delete on public.cohort_batches;
create trigger guard_cohort_batch_delete
  before delete on public.cohort_batches
  for each row execute function public.guard_cohort_batch_delete();

-- ── Cohort weeks ─────────────────────────────────────────────────────────
create or replace function public.guard_cohort_week_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submissions int;
  v_attendance int;
begin
  if public.history_delete_override() then
    return old;
  end if;
  select count(*) into v_submissions from cohort_week_submissions where cohort_week_id = old.id;
  select count(*) into v_attendance from cohort_week_attendance where cohort_week_id = old.id;
  if v_submissions + v_attendance > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Week %s can''t be deleted: it has %s submissions and %s attendance marks.',
        old.week_number, v_submissions, v_attendance);
  end if;
  return old;
end;
$$;

drop trigger if exists guard_cohort_week_delete on public.cohort_weeks;
create trigger guard_cohort_week_delete
  before delete on public.cohort_weeks
  for each row execute function public.guard_cohort_week_delete();

-- Trigger functions only; nobody calls them directly.
revoke execute on function
  public.guard_offering_delete(),
  public.guard_course_delete(),
  public.guard_chapter_delete(),
  public.guard_cohort_batch_delete(),
  public.guard_cohort_week_delete()
from public, anon, authenticated;
