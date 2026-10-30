-- Stage 2 of the backend plan: admin reports read two small tables built from
-- legacy_enrolments instead of rescanning its 83,718 rows on every page load.
--
--   legacy_revenue_daily    one row per IST day and offering
--   legacy_customers        one row per legacy phone, with its totals
--   legacy_customer_emails  every email seen on each legacy phone, lower-cased
--
-- refresh_legacy_reports() rebuilds all three. It runs once at the end of this file,
-- then after any statement that changes a column they read: mapping saves,
-- TagMango ingests, admin edits. Claims only set claimed_by_user_id and
-- claimed_at, so sign-in never triggers a rebuild.
--
-- New admin RPCs. The old ones stay until no page calls them.
--   admin_revenue              same numbers as revenue_in_range
--   admin_revenue_by_offering  same numbers as offering_performance_in_range
--   admin_dashboard_summary    same numbers as admin_dashboard_combined
--   admin_users_page           replaces the users_unified reads on the Users page
--
-- One rule differs from users_unified, on purpose: a legacy phone counts as
-- having an account when any user has that number in any format ("+91…" or
-- "91…"), or when any user has one of the emails seen on that phone. The view
-- matched the exact phone string and dropped rows one at a time by email, so a
-- buyer could show up both as a user and as a legacy-only customer.

create table if not exists public.legacy_revenue_daily (
  day date,          -- IST day of legacy_purchased_at; null when the date is unknown
  offering_id uuid,  -- null while the TagMango program is unmapped
  order_count integer not null,
  amount_inr numeric not null,
  constraint legacy_revenue_daily_day_offering_key unique nulls not distinct (day, offering_id)
);

create table if not exists public.legacy_customers (
  phone text primary key,
  phone_digits text not null,
  email text,
  full_name text,
  city text,
  state text,
  created_at timestamptz not null,
  lifetime_revenue_inr integer not null,
  first_purchase_at timestamptz,
  last_purchase_at timestamptz,
  purchase_count integer not null
);

create index if not exists legacy_customers_ltv_idx
  on public.legacy_customers (lifetime_revenue_inr desc, created_at desc);

create table if not exists public.legacy_customer_emails (
  email text not null,
  phone text not null,
  primary key (email, phone)
);

-- Only the security definer RPCs below read these tables.
alter table public.legacy_revenue_daily enable row level security;
alter table public.legacy_customers enable row level security;
alter table public.legacy_customer_emails enable row level security;
revoke all on public.legacy_revenue_daily, public.legacy_customers, public.legacy_customer_emails
  from anon, authenticated;

create or replace function public.refresh_legacy_reports()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.refresh_legacy_reports'));

  delete from public.legacy_revenue_daily;
  insert into public.legacy_revenue_daily (day, offering_id, order_count, amount_inr)
  select (legacy_purchased_at at time zone 'Asia/Kolkata')::date, offering_id,
         count(*), coalesce(sum(legacy_amount_inr), 0)
  from public.legacy_enrolments
  group by 1, 2;

  delete from public.legacy_customers;
  insert into public.legacy_customers (
    phone, phone_digits, email, full_name, city, state, created_at,
    lifetime_revenue_inr, first_purchase_at, last_purchase_at, purchase_count)
  select phone,
         regexp_replace(phone, '\D', '', 'g'),
         nullif(max(email), ''),
         nullif(max(full_name), ''),
         nullif(max(city), ''),
         nullif(max(state), ''),
         min(created_at),
         coalesce(sum(legacy_amount_inr), 0)::integer,
         min(legacy_purchased_at),
         max(legacy_purchased_at),
         count(*)::integer
  from public.legacy_enrolments
  group by phone;

  delete from public.legacy_customer_emails;
  insert into public.legacy_customer_emails (email, phone)
  select distinct lower(email), phone
  from public.legacy_enrolments
  where email <> '';

  -- Fresh statistics keep the Users page plan on hash joins.
  analyze public.legacy_revenue_daily, public.legacy_customers, public.legacy_customer_emails;
end;
$$;

create or replace function public.legacy_enrolments_refresh_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_legacy_reports();
  return null;
end;
$$;

revoke all on function public.refresh_legacy_reports() from public, anon, authenticated;
revoke all on function public.legacy_enrolments_refresh_reports() from public, anon, authenticated;

drop trigger if exists legacy_enrolments_refresh_reports_ins_del on public.legacy_enrolments;
create trigger legacy_enrolments_refresh_reports_ins_del
  after insert or delete or truncate on public.legacy_enrolments
  for each statement execute function public.legacy_enrolments_refresh_reports();

drop trigger if exists legacy_enrolments_refresh_reports_upd on public.legacy_enrolments;
create trigger legacy_enrolments_refresh_reports_upd
  after update of phone, email, full_name, city, state, offering_id,
                  legacy_amount_inr, legacy_purchased_at, created_at
  on public.legacy_enrolments
  for each statement execute function public.legacy_enrolments_refresh_reports();

-- Legacy purchases in [p_from, p_to), per offering. Whole IST days come from
-- legacy_revenue_daily. The part-days at either end come from
-- legacy_enrolments through legacy_enrolments_purchased_at_idx, so a window
-- that does not start or end at IST midnight still gets the exact total.
create or replace function public.legacy_revenue_in_window(p_from timestamptz, p_to timestamptz)
returns table (offering_id uuid, order_count bigint, amount_inr numeric)
language sql
stable
as $$
  with b as (
    select d0, d1,
           d0::timestamp at time zone 'Asia/Kolkata' as t0,
           d1::timestamp at time zone 'Asia/Kolkata' as t1
    from (
      select (p_from at time zone 'Asia/Kolkata')::date
               + case when (p_from at time zone 'Asia/Kolkata')::time = '00:00' then 0 else 1 end as d0,
             (p_to at time zone 'Asia/Kolkata')::date as d1
    ) x
  ),
  edges as (
    select p_from as lo, case when b.d0 < b.d1 then b.t0 else p_to end as hi from b
    union all
    select b.t1, p_to from b where b.d0 < b.d1
  ),
  parts as (
    select r.offering_id, r.order_count::bigint as order_count, r.amount_inr
    from public.legacy_revenue_daily r, b
    where b.d0 < b.d1 and r.day >= b.d0 and r.day < b.d1
    union all
    select le.offering_id, 1, coalesce(le.legacy_amount_inr, 0)
    from edges e
    join public.legacy_enrolments le
      on le.legacy_purchased_at >= e.lo and le.legacy_purchased_at < e.hi
  )
  select offering_id, sum(order_count), sum(amount_inr)
  from parts
  group by offering_id;
$$;

-- Legacy phones with no account: no user has the number in any format, and no
-- user has any email seen on that phone.
--
-- This helper and legacy_revenue_in_window carry no SET search_path, so the
-- planner can inline them into the RPCs that call them. Every name in them is
-- schema-qualified, and clients cannot execute them.
create or replace function public.legacy_only_customers()
returns setof public.legacy_customers
language sql
stable
as $$
  select lc.*
  from public.legacy_customers lc
  where not exists (
          select 1 from public.users u
          where u.phone is not null and regexp_replace(u.phone, '\D', '', 'g') = lc.phone_digits)
    and not exists (
          select 1 from public.legacy_customer_emails lce
          join public.users u on lower(u.email) = lce.email
          where lce.phone = lc.phone);
$$;

revoke all on function public.legacy_revenue_in_window(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.legacy_only_customers() from public, anon, authenticated;

create or replace function public.admin_revenue(p_from timestamptz, p_to timestamptz)
returns table (
  live_paid_inr bigint, live_order_count integer, live_unique_buyers integer,
  legacy_paid_inr bigint, legacy_order_count integer, legacy_unique_buyers integer,
  total_paid_inr bigint, total_order_count integer, refunded_inr bigint)
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select coalesce(sum(total_inr) filter (where status = 'captured'), 0)::bigint as paid,
           count(*) filter (where status = 'captured')::integer as orders,
           count(distinct user_id) filter (where status = 'captured')::integer as buyers,
           coalesce(sum(total_inr) filter (where status = 'refunded'), 0)::bigint as refunded
    from public.payment_orders
    where created_at >= p_from and created_at < p_to
  ),
  legacy as (
    select coalesce(sum(amount_inr), 0)::bigint as paid,
           coalesce(sum(order_count), 0)::integer as orders
    from public.legacy_revenue_in_window(p_from, p_to)
  ),
  legacy_buyers as (
    select count(distinct phone)::integer as buyers
    from public.legacy_enrolments
    where legacy_purchased_at >= p_from and legacy_purchased_at < p_to
  )
  select live.paid, live.orders, live.buyers,
         legacy.paid, legacy.orders, legacy_buyers.buyers,
         (live.paid + legacy.paid)::bigint, (live.orders + legacy.orders)::integer,
         live.refunded
  from live, legacy, legacy_buyers
  where (select public.is_admin());
$$;

create or replace function public.admin_revenue_by_offering(p_from timestamptz, p_to timestamptz)
returns table (
  offering_id uuid, offering_title text, offering_slug text, offering_type text,
  total_enrolments integer, active_enrolments integer,
  live_orders_in_window integer, legacy_orders_in_window integer, total_orders_in_window integer,
  live_revenue_in_window bigint, legacy_revenue_in_window bigint, total_revenue_in_window bigint)
language sql
stable
security definer
set search_path = public
as $$
  with live_enrolments as (
    select e.offering_id, count(*)::integer as n,
           count(*) filter (where e.status = 'active')::integer as active
    from public.enrolments e
    group by e.offering_id
  ),
  legacy_enrolments_all as (
    select r.offering_id, sum(r.order_count)::integer as n
    from public.legacy_revenue_daily r
    where r.offering_id is not null
    group by r.offering_id
  ),
  live_window as (
    select po.offering_id, count(*)::integer as orders, coalesce(sum(po.total_inr), 0)::bigint as paid
    from public.payment_orders po
    where po.status = 'captured' and po.created_at >= p_from and po.created_at < p_to
    group by po.offering_id
  ),
  legacy_window as (
    select w.offering_id, w.order_count::integer as orders, w.amount_inr::bigint as paid
    from public.legacy_revenue_in_window(p_from, p_to) w
  ),
  per_offering as (
    select o.id as offering_id, o.title as offering_title, o.slug as offering_slug, o.type as offering_type,
           (coalesce(le.n, 0) + coalesce(la.n, 0))::integer as total_enrolments,
           coalesce(le.active, 0) as active_enrolments,
           coalesce(lw.orders, 0) as live_orders_in_window,
           coalesce(gw.orders, 0) as legacy_orders_in_window,
           coalesce(lw.paid, 0) as live_revenue_in_window,
           coalesce(gw.paid, 0) as legacy_revenue_in_window
    from public.offerings o
    left join live_enrolments le on le.offering_id = o.id
    left join legacy_enrolments_all la on la.offering_id = o.id
    left join live_window lw on lw.offering_id = o.id
    left join legacy_window gw on gw.offering_id = o.id
    where o.status = 'active' or la.offering_id is not null
  )
  select offering_id, offering_title, offering_slug, offering_type,
         total_enrolments, active_enrolments, live_orders_in_window, legacy_orders_in_window,
         (live_orders_in_window + legacy_orders_in_window)::integer,
         live_revenue_in_window, legacy_revenue_in_window,
         (live_revenue_in_window + legacy_revenue_in_window)::bigint
  from per_offering
  where (select public.is_admin())
  order by (live_revenue_in_window + legacy_revenue_in_window) desc nulls last, offering_title;
$$;

create or replace function public.admin_dashboard_summary(p_from timestamptz, p_to timestamptz)
returns table (
  total_students_unified integer, new_students_in_window integer, legacy_buyers_in_window integer,
  active_enrolments_total integer, enrolments_in_window integer, total_revenue_inr_in_window bigint,
  live_revenue_inr bigint, legacy_revenue_inr bigint, order_count_in_window integer,
  active_offerings_count integer)
language sql
stable
security definer
set search_path = public
as $$
  with
  users_all as (select count(*)::integer as c from public.users),
  legacy_only as (select count(*)::integer as c from public.legacy_only_customers()),
  new_live as (
    select count(*)::integer as c from public.users
    where created_at >= p_from and created_at < p_to
  ),
  legacy_buyers as (
    select count(distinct phone)::integer as c from public.legacy_enrolments
    where legacy_purchased_at >= p_from and legacy_purchased_at < p_to
  ),
  active_live as (select count(*)::integer as c from public.enrolments where status = 'active'),
  total_legacy as (select coalesce(sum(order_count), 0)::integer as c from public.legacy_revenue_daily),
  enrols_window_live as (
    select count(*)::integer as c from public.enrolments
    where created_at >= p_from and created_at < p_to
  ),
  rev_live as (
    select coalesce(sum(total_inr), 0)::bigint as s, count(*)::integer as c
    from public.payment_orders
    where status = 'captured' and created_at >= p_from and created_at < p_to
  ),
  rev_legacy as (
    select coalesce(sum(amount_inr), 0)::bigint as s, coalesce(sum(order_count), 0)::integer as c
    from public.legacy_revenue_in_window(p_from, p_to)
  ),
  active_off as (select count(*)::integer as c from public.offerings where status = 'active')
  select (users_all.c + legacy_only.c)::integer, new_live.c, legacy_buyers.c,
         (active_live.c + total_legacy.c)::integer,
         (enrols_window_live.c + rev_legacy.c)::integer,
         (rev_live.s + rev_legacy.s)::bigint, rev_live.s, rev_legacy.s,
         (rev_live.c + rev_legacy.c)::integer, active_off.c
  from users_all, legacy_only, new_live, legacy_buyers, active_live, total_legacy,
       enrols_window_live, rev_live, rev_legacy, active_off
  where (select public.is_admin());
$$;

-- The Users page: real users plus legacy-only customers, filtered, sorted by
-- lifetime revenue and paged. Returns {total_count, rows}, or null for a
-- non-admin. p_text matches name and email, p_phone matches phone; the page
-- builds both from the search box, as it did for users_unified.
create or replace function public.admin_users_page(
  p_text text default null,
  p_phone text default null,
  p_scope text default 'all',
  p_role text default null,
  p_vertical text default null,
  p_limit integer default 50,
  p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with all_rows as (
    select u.id, u.email, u.phone, u.full_name, u.role, u.member_number, u.created_at, u.last_active_at,
           true as is_real, u.is_legacy, u.legacy_source, u.city, u.state, u.country,
           u.program_vertical, u.specific_vertical,
           coalesce(u.lifetime_revenue_inr, 0) as lifetime_revenue_inr,
           u.first_purchase_at, u.last_purchase_at, coalesce(u.purchase_count, 0) as purchase_count
    from public.users u
    union all
    select null::uuid, lc.email, lc.phone, lc.full_name, 'student', null::integer, lc.created_at, null::timestamptz,
           false, true, 'tagmango', lc.city, lc.state, 'India',
           null::text, null::text,
           lc.lifetime_revenue_inr,
           lc.first_purchase_at, lc.last_purchase_at, lc.purchase_count
    from public.legacy_only_customers() lc
  ),
  filtered as (
    select * from all_rows r
    where (coalesce(p_scope, 'all') = 'all'
           or (p_scope = 'active' and r.is_legacy = false)
           or (p_scope = 'legacy' and r.is_legacy = true))
      and (p_role is null or r.role = p_role)
      and (p_vertical is null or r.program_vertical = p_vertical)
      and (p_text is null
           or r.full_name ilike '%' || p_text || '%'
           or r.email ilike '%' || p_text || '%'
           or r.phone ilike '%' || coalesce(p_phone, p_text) || '%')
  ),
  page as (
    select * from filtered
    order by lifetime_revenue_inr desc nulls last, created_at desc, phone
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
           'total_count', (select count(*) from filtered),
           'rows', coalesce((select jsonb_agg(to_jsonb(p) order by p.lifetime_revenue_inr desc nulls last, p.created_at desc, p.phone) from page p), '[]'::jsonb))
  where (select public.is_admin());
$$;

revoke all on function public.admin_revenue(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_revenue_by_offering(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_dashboard_summary(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_users_page(text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_revenue(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_revenue_by_offering(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_dashboard_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_users_page(text, text, text, text, text, integer, integer) to authenticated;

select public.refresh_legacy_reports();
