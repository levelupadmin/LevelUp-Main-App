-- Catalogue model: Page → Offering → Content (founder, 6 Nov 2026).
--
--   Page      what people see: Explore, Home, /p/<slug>. Says where it shows
--             (hidden / link / listed / featured), its place in its row, and
--             which offering its button sells.
--   Offering  what people pay for (the checkout, TagMango's "service"): price,
--             how people get it (offerings.access), add-ons, and the courses
--             it unlocks (offering_courses, unchanged). Enrolments stay here.
--   Content   courses → sections → chapters (unchanged).
--
-- offerings.status keeps its values; the admin now names them
--   active = "Selling", archived = "Closed (students keep access)", draft.
--
-- Nothing here changes who can watch what. It replaces three hidden jobs of
-- "price ₹0" and "is_public" with explicit columns:
--   * ₹0 no longer means "anyone may take it free": only access = 'free' does.
--   * is_public no longer decides whether a guest may pay: access does.
--   * is_public is now DERIVED from pages (trigger below), so older app
--     builds and any reader of is_public keep seeing the same storefront.
--
-- Undo: drop function public.admin_set_offering_links(uuid, uuid[], jsonb);
--       drop function public.admin_catalogue_counts();
--       drop trigger pages_sync_is_public on public.pages;
--       drop function public.pages_sync_is_public();
--       alter table public.offerings drop column page_id, drop column access;
--       alter table public.offerings drop column checkout_cover_url, drop column checkout_when;
--       drop table public.pages;
--       (is_public keeps the values it had; nothing else is touched.)

begin;

-- 1. How people get an offering ------------------------------------------------
alter table public.offerings add column if not exists access text;

update public.offerings set access = case
  when payment_mode = 'staged' or coalesce(trim(tally_form_url), '') <> '' then 'apply'
  when product_tier = 'live_cohort' then 'team'
  -- Sold in the app today = priced AND public. A priced private offering was
  -- only ever granted by the team (e.g. the ₹4,999 SMP packs, 0 app sales in
  -- the 60 days before 6 Nov 2026): it must not become buyable by its link.
  when coalesce(price_inr, 0) > 0 and is_public then 'buy'
  else 'team'          -- ₹0 and not a cohort: resource packs, imports. Never free by accident.
end
where access is null;

alter table public.offerings
  alter column access set default 'buy',
  alter column access set not null;
alter table public.offerings drop constraint if exists offerings_access_check;
alter table public.offerings add constraint offerings_access_check
  check (access in ('buy', 'free', 'apply', 'team'));

comment on column public.offerings.access is
  'How people get it: buy (checkout, price > 0) | free (anyone may claim) | apply (Tally / staged) | team (added by the team only)';

-- 2. Pages ---------------------------------------------------------------------
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  listing text not null default 'hidden'
    check (listing in ('hidden', 'link', 'listed', 'featured')),
  position integer not null default 100,
  carousel_position integer,
  opens text not null default 'page' check (opens in ('page', 'checkout')),
  button_offering_id uuid references public.offerings(id) on delete set null,
  carousel_title text,
  card_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pages is
  'What people see (Explore, Home, /p/<slug>). listing: hidden | link (page works, not listed) | listed | featured (also in the Home carousel, at carousel_position). position = order inside its row. button_offering_id = what its Buy/Apply button opens.';

alter table public.offerings
  add column if not exists page_id uuid references public.pages(id) on delete set null;
comment on column public.offerings.page_id is
  'The page this offering belongs under (e.g. every BFP batch under the BFP page). The page''s button sells pages.button_offering_id.';

create index if not exists offerings_page_id_idx on public.offerings(page_id);
create index if not exists pages_button_offering_idx on public.pages(button_offering_id);

alter table public.pages enable row level security;
drop policy if exists pages_read_shown on public.pages;
create policy pages_read_shown on public.pages for select
  using (listing <> 'hidden' or public.is_admin());
drop policy if exists pages_admin_all on public.pages;
create policy pages_admin_all on public.pages for all
  using (public.is_admin()) with check (public.is_admin());
grant select on public.pages to anon, authenticated;
grant insert, update, delete on public.pages to authenticated;

create or replace function public.pages_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists pages_touch on public.pages;
create trigger pages_touch before update on public.pages
  for each row execute function public.pages_touch();

-- 3. Backfill pages from today's storefront ------------------------------------
-- Every active, public offering gets a page with the same slug, so every
-- /p/<slug> link keeps working. What was on Home/Explore is "listed"; the
-- rest of the public ones are "link only". Order = the lists that used to be
-- hard-coded in stage/home/discover.tsx.
insert into public.pages (slug, title, listing, position, button_offering_id, carousel_title)
select o.slug, trim(o.title),
  case
    -- Team-only offerings can't be bought or claimed, so they stop showing
    -- anywhere (is_public follows: older app builds hide them too). Their
    -- students keep access; e.g. the free Film Direction 101 resources pack.
    when o.access = 'team' then 'hidden'
    when o.product_tier in ('masterclass', 'live_cohort', 'workshop')
     and not exists (select 1 from public.offering_courses oc join public.courses c on c.id = oc.course_id
                     where oc.offering_id = o.id and c.show_on_browse = false)
     and (o.product_tier <> 'live_cohort' or (o.landing->>'v') = '2')
      then case when o.slug in ('breakthrough-filmmakers-program', 'nelson-dilipkumar-teaches-filmmaking',
                                'video-editing-academy', 'ravi-basrur-teaches-music-composition', 'creator-academy')
                then 'featured' else 'listed' end
    else 'link'
  end,
  coalesce(array_position(array[
    'breakthrough-filmmakers-program', 'video-editing-academy', 'creator-academy',
    'karthick-subbaraj-teaches-filmmaking', 'anthony-gonsalvez-teaches-film-editing', 'g-venket-ram-teaches-photography',
    'drk-kiran-teaches-art-direction', 'ravi-basrur-teaches-music-composition', 'lokesh-kanagaraj-teaches-film-making',
    'nelson-dilipkumar-teaches-filmmaking']::text[], o.slug) * 10, 500),
  o.id,
  case o.slug
    when 'nelson-dilipkumar-teaches-filmmaking' then 'Learn filmmaking from Nelson Dilipkumar'
    when 'ravi-basrur-teaches-music-composition' then 'Learn music from Ravi Basrur'
  end
from public.offerings o
where o.status = 'active' and o.is_public
on conflict (slug) do nothing;

-- The Home carousel has its own order (BFP, Nelson, VE, Ravi, Creator
-- Academy); position stays the order inside each row.
update public.pages p set carousel_position = v.pos
from (values ('breakthrough-filmmakers-program', 1), ('nelson-dilipkumar-teaches-filmmaking', 2),
             ('video-editing-academy', 3), ('ravi-basrur-teaches-music-composition', 4),
             ('creator-academy', 5)) v(slug, pos)
where p.slug = v.slug;

-- Each page's own offering sits under it.
update public.offerings o set page_id = p.id
from public.pages p where p.button_offering_id = o.id and o.page_id is null;

-- Cohort batches sit under their programme's page.
update public.offerings o set page_id = p.id
from public.pages p
where o.page_id is null
  and (o.product_tier = 'live_cohort' or o.payment_mode = 'staged')
  and (
       (p.slug = 'breakthrough-filmmakers-program' and o.slug ~ '^(the-)?breakthrough-filmmakers-program-batch')
    or (p.slug = 'video-editing-academy'          and o.slug ~ '^the-levelup-video-editing-academy-[0-9]')
    or (p.slug = 'creator-academy'                and o.slug ~ '^(the-levelup-creator-academy-cohort|creator-academy-edition)')
  );

-- 4. is_public follows the pages from now on -----------------------------------
-- An offering is "public" when a page that is not hidden sells it. Older app
-- builds read is_public for their storefront, so they keep matching.
create or replace function public.pages_sync_is_public() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  ids := array_remove(array[
    case when tg_op in ('UPDATE', 'DELETE') then old.button_offering_id end,
    case when tg_op in ('INSERT', 'UPDATE') then new.button_offering_id end], null);
  update public.offerings o
     set is_public = exists (select 1 from public.pages p
                             where p.button_offering_id = o.id and p.listing <> 'hidden')
   where o.id = any(ids);
  return null;
end $$;
drop trigger if exists pages_sync_is_public on public.pages;
create trigger pages_sync_is_public after insert or update or delete on public.pages
  for each row execute function public.pages_sync_is_public();

-- One-time alignment: public = sold by a shown page.
update public.offerings o set is_public = exists (
  select 1 from public.pages p where p.button_offering_id = o.id and p.listing <> 'hidden');

-- 5. Admin helpers ----------------------------------------------------------------
-- One all-or-nothing save for what an offering unlocks (courses) and the
-- add-ons on its checkout (bumps). The editor used to delete every link and
-- re-add them in separate requests with errors ignored, so one failure left
-- an offering with no courses (students lose access) while it said "saved".
create or replace function public.admin_set_offering_links(
  p_offering_id uuid, p_course_ids uuid[], p_bumps jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_course_ids is not null then
    delete from public.offering_courses
     where offering_id = p_offering_id and not (course_id = any(p_course_ids));
    insert into public.offering_courses (offering_id, course_id)
    select p_offering_id, c from unnest(p_course_ids) c
    on conflict do nothing;
  end if;
  if p_bumps is not null then
    delete from public.offering_bumps where parent_offering_id = p_offering_id;
    insert into public.offering_bumps (parent_offering_id, bump_offering_id, headline, bump_price_override_inr, sort_order)
    select p_offering_id, (b->>'bump_offering_id')::uuid, nullif(trim(b->>'headline'), ''),
           nullif(b->>'price_override', '')::numeric, (t.ord - 1)::int
      from jsonb_array_elements(p_bumps) with ordinality t(b, ord)
     where (b->>'bump_offering_id')::uuid <> p_offering_id;
  end if;
end $$;
revoke all on function public.admin_set_offering_links(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.admin_set_offering_links(uuid, uuid[], jsonb) to authenticated;

-- Student counts for Admin → Catalogue, counted in the database (the browser
-- stops at 1,000 rows).
create or replace function public.admin_catalogue_counts()
returns table (offering_id uuid, students bigint, tagmango bigint)
language sql stable security definer set search_path = public as $$
  select o.id,
         (select count(*) from public.enrolments e where e.offering_id = o.id and e.status = 'active'),
         (select count(*) from public.legacy_enrolments l where l.offering_id = o.id)
    from public.offerings o
   where public.is_admin();
$$;
revoke all on function public.admin_catalogue_counts() from public, anon;
grant execute on function public.admin_catalogue_counts() to authenticated;

-- 6. The checkout page template -------------------------------------------------
-- An offering IS its checkout page (TagMango's "service"). Two new blocks; the
-- rest already exist: checkout_bullets ("What you get"), checkout_testimonials,
-- refund_policy_days, offering_bumps (add-ons), custom_field_definitions
-- (questions for the buyer).
alter table public.offerings add column if not exists checkout_cover_url text;
alter table public.offerings add column if not exists checkout_when text;
alter table public.offerings drop constraint if exists offerings_checkout_cover_url_check;
alter table public.offerings add constraint offerings_checkout_cover_url_check
  check (checkout_cover_url is null or (length(checkout_cover_url) <= 1000 and checkout_cover_url ~* '^https?://'));
alter table public.offerings drop constraint if exists offerings_checkout_when_len_check;
alter table public.offerings add constraint offerings_checkout_when_len_check
  check (checkout_when is null or length(checkout_when) <= 200);
comment on column public.offerings.checkout_cover_url is 'Checkout cover: an image, or a video when it ends in .mp4/.webm/.mov';
comment on column public.offerings.checkout_when is 'Checkout "when" line, e.g. "Wed 8 PM · 2 hours · on Zoom"';

commit;
