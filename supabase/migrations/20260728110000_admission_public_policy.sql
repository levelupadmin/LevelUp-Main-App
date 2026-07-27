-- ============================================================
-- PHASE DC — D-4: the public admission page whitelist (REQ-DEC-6 / SEC-PUBLIC-1)
-- ============================================================
--
-- ── THE MECHANISM (read this first; it is the point the council interrogates) ──
--
-- RLS DOES NOT PROJECT COLUMNS. A policy grants access to a ROW; once a row is
-- reachable, a PostgREST caller picks whichever columns it likes off that row.
-- So a `TO anon USING (published)` SELECT policy on `cohort_applications` would
-- hand an anonymous visitor the 100-word essay, the contact details and the
-- funnel status of every published admission. There is therefore **NO anon
-- SELECT policy on `cohort_applications` in this migration, and none is wanted.**
--
-- The whitelist is enforced STRUCTURALLY, in three layers:
--   1. `REVOKE ALL ON TABLE public.cohort_applications FROM anon` — the `anon`
--      DB role holds no table privilege at all, so a direct PostgREST probe of
--      the table is denied at the GRANT layer, before RLS is even consulted.
--      What this does and does not buy is spelled out in §3; read it before
--      quoting this line as a guarantee.
--   2. `public.get_admission_page(text)` — a SECURITY DEFINER, STABLE, pinned
--      `search_path` function whose SELECT list is the whitelist. It is the ONLY
--      read `anon` may EXECUTE. A SECURITY DEFINER function returns exactly the
--      columns it projects; the caller cannot ask it for more.
--   3. The client (`src/pages/AdmissionPublic.tsx`) picks the whitelisted keys
--      off the RPC row by name and renders nothing else — never `select('*')`,
--      never a spread of the response.
--      `src/lib/__tests__/admissionPublicPolicy.test.ts` diffs that client array
--      against the RETURNS TABLE list below so the two halves cannot drift.
--
-- ── THE PERMITTED LIST (literal, exhaustive; anything not on it is denied) ──
--   source column                                    → returned as
--   ─────────────────────────────────────────────────────────────────────
--   cohort_applications.full_name                    → admitted_name
--   offerings.title           (join, public-only)    → program_title
--
--   Two fields. That is the whole public surface. The copy deck's accept-ratio
--   line, faculty names, the applicant's location and the date of decision are
--   deliberately NOT here: each one widens the whitelist, and a wider whitelist
--   is a new Tier-1 review. Everything else the page renders is static,
--   cohort-agnostic copy.
--
--   No date is returned. There is no admitted-on column on this table (see
--   `20260413100000`), and `admission_page_published_at` is the stamp for when
--   the SHARE PAGE was published, not when the person was admitted. Projecting
--   it and captioning it "Admitted …" would print a date the data does not
--   support, on a card styled as a credential. It stays a FILTER, like `status`.
--
-- ── THE DENY LIST (never projected, never granted, not negotiable) ──
--   bio                  ← this IS the 100-word essay (FIELD_ALIASES.bio,
--                          supabase/functions/_shared/tally.ts:234). NFR-COPY-1
--                          forbids surfacing it in ANY UI, let alone a public one.
--   tally_data           ← the entire raw Tally submission blob (jsonb).
--   email, phone         ← contact PII.
--   city, occupation     ← applicant PII.
--   status               ← internal funnel state. Used BELOW as a filter
--                          (an accepted-or-beyond SET, see §4), never as an
--                          output column; a filter reveals nothing a published
--                          link did not already imply.
--   admission_page_published_at ← filter only (published vs not). Never an
--                          output column; see the note under the permitted list.
--   rejection_reason, interview_notes, interview_date, tally_response_id
--   user_id, id, offering_id, created_at, updated_at, app_fee_paid_at
--   app_fee_payment_id, confirmation_payment_id, balance_payment_id
--   reconciled_stage, reconciled_key, reconciled_at,
--   completed_no_fee, contactable_partial   ← the reconciler mirror set.
--
-- ── WHAT THE SHARE TOKEN IS, AND WHAT IT IS NOT ──
-- `admission_page_slug` is UNGUESSABLE (256 bits), not SECRET. It travels in a
-- URL, and URLs end up in browser history, in the OS share sheet, in whatever
-- chat app the link was pasted into, and in any analytics vendor the app root
-- has enabled on the page. The page suppresses the third-party pixel loaders
-- while it is mounted (see its header), but the honest security property is the
-- one below, not secrecy in transit:
--   a leaked token addresses EXACTLY the two whitelisted fields of ONE record
--   the admitted person's page was deliberately published for, and nothing else.
-- Revocation is therefore the real lever: `unpublish_admission_page()` (§5)
-- clears both the stamp and the token, so every link already shared 404s and a
-- later republish mints a different one.
--
-- ── SHAPE OF THE CHANGE ──
-- Additive, idempotent, reversible, and **free of any aborting RAISE**: a DO
-- block that throws takes every sibling migration in the same `db push` down
-- with it, so the guards below skip rather than throw. Both new columns default
-- to NULL, i.e. UNPUBLISHED, so applying this migration makes nothing public.
-- Unpublish is per-record and instant: the RPC then returns zero rows, which the
-- page renders as 404/private. That is the ONLY deliberate revocation lever —
-- the status filter in §4 is a SET, not a single value, precisely so a routine
-- funnel advance (the D-3 seat payment) can never act as a second, invisible
-- one. The two statuses that do stop a page rendering, 'rejected' and
-- 'withdrawn', mean the person is no longer admitted, which is the same thing
-- the page says. SOR-1 holds throughout: nothing here writes `status`.
--
-- Source: PRD REQ-DEC-6; ACCESS-SECURITY SEC-PUBLIC-1; DATA-MODEL §4.2
-- (`admission_page_slug` / `admission_page_published_at`); COPY §4.7 6H.

-- ── 1. The publish marker + the share token ──────────────────────────────
-- Neither column exists today. Both are nullable with no default, so every
-- existing row lands unpublished. The URL is keyed on the token, NEVER on the
-- application uuid: the uuid leaks nothing by itself, but it is the join key
-- printed in admin surfaces and support threads, and a share link must be
-- revocable without orphaning the row it points at.
ALTER TABLE public.cohort_applications
  ADD COLUMN IF NOT EXISTS admission_page_slug text,
  ADD COLUMN IF NOT EXISTS admission_page_published_at timestamptz;

COMMENT ON COLUMN public.cohort_applications.admission_page_slug IS
  'Unguessable (not secret) 64-hex share token for the public admission page (REQ-DEC-6). NULL = never published. It addresses only the two whitelisted fields of this one row; clearing it revokes every link already shared.';
COMMENT ON COLUMN public.cohort_applications.admission_page_published_at IS
  'Publish stamp for the public admission page (REQ-DEC-6). NULL = unpublished; get_admission_page() then returns zero rows and the link 404s.';

-- Partial unique index: the token addresses exactly one row, and unpublished
-- rows (the overwhelming majority) stay out of the index entirely.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cohort_apps_admission_page_slug
  ON public.cohort_applications (admission_page_slug)
  WHERE admission_page_slug IS NOT NULL;

-- Soft guard making "unguessable" checkable rather than aspirational: at least
-- 32 characters, and never the row's own uuid. NOT VALID so the add is instant
-- and never scans the table; new writes are still checked. Idempotent — skip if
-- a prior run already added it. No RAISE: the DO block only ever skips.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cohort_applications_admission_page_slug_check'
      AND conrelid = 'public.cohort_applications'::regclass
  ) THEN
    ALTER TABLE public.cohort_applications
      ADD CONSTRAINT cohort_applications_admission_page_slug_check
      CHECK (
        admission_page_slug IS NULL
        OR (length(admission_page_slug) >= 32 AND admission_page_slug <> id::text)
      ) NOT VALID;
  END IF;
END $$;

-- ── 2. Token minter ──────────────────────────────────────────────────────
-- 64 hex characters / 256 bits from two `gen_random_uuid()` draws. Built on the
-- core uuid generator on purpose so the migration needs no pgcrypto extension.
--
-- Granted to `authenticated` as well as `service_role` because §5's publisher
-- runs SECURITY INVOKER (the caller's own RLS decides whether the write lands),
-- so an admin publishing a page executes this as themselves. That grant hands
-- out nothing: the function reads no table, takes no argument and returns a
-- random string, which every caller could already produce with
-- `gen_random_uuid()`. It is the UPDATE in §5, not the token, that is gated.
-- `anon` holds no EXECUTE on it.
CREATE OR REPLACE FUNCTION public.new_admission_page_slug()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

REVOKE ALL ON FUNCTION public.new_admission_page_slug() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.new_admission_page_slug() TO authenticated, service_role;

COMMENT ON FUNCTION public.new_admission_page_slug() IS
  'Mints an unguessable 64-hex-char admission_page_slug (REQ-DEC-6). Reads nothing, writes nothing. anon holds no EXECUTE.';

-- ── 3. Close the table to anon at the GRANT layer ────────────────────────
-- Layer 1 of the mechanism above. `cohort_applications` keeps its existing RLS
-- unchanged (`admin_manage_applications` ALL, `students_read_own_applications`
-- SELECT `user_id = auth.uid()`); this migration adds NO policy to it.
--
-- This does NOT touch the app. The anon API KEY is not the `anon` DB ROLE: a
-- signed-in request carries a JWT and PostgREST executes it as `authenticated`,
-- whose grant is untouched, so students keep reading their own row. Every edge
-- function that touches this table (`create-razorpay-order`,
-- `verify-razorpay-payment`, `razorpay-webhook`, the Tally webhook/poller, the
-- reconciler) goes through a service-role client, which is likewise untouched.
-- The only caller affected is a genuinely logged-out one, which already read
-- zero rows because no anon policy exists.
--
-- WHAT IT GUARANTEES, EXACTLY: for the `anon` role, and only for that role, a
-- later permissive policy cannot open this table, because a policy grants row
-- visibility and this REVOKE removes the table privilege that PostgREST checks
-- first. That covers both `TO anon` policies and the commoner accident, a policy
-- with no TO clause (which applies to PUBLIC, hence to anon).
--
-- WHAT IT DOES NOT GUARANTEE: anything about `authenticated`. That role's stock
-- grants are deliberately left in place — students must keep reading their own
-- row — so a future `CREATE POLICY … FOR SELECT USING (true);` with no TO
-- clause, or one scoped `TO authenticated`, would open every application row to
-- every signed-in account, and NOTHING in this file would stop it. That is a
-- different threat model (a real, auditable account rather than a stranger with
-- a link) and a different fix: review, plus the cross-migration scan in
-- `admissionPublicPolicy.test.ts` that fails if any migration ever adds an
-- unscoped policy to this table.
REVOKE ALL ON TABLE public.cohort_applications FROM anon;

-- ── 4. The whitelist reader ──────────────────────────────────────────────
-- DROP before CREATE because Postgres cannot change a `RETURNS TABLE` shape in
-- place (the `reference_ml_db_apply` lesson), and because it makes re-running
-- this migration idempotent regardless of what shape a prior run left behind.
DROP FUNCTION IF EXISTS public.get_admission_page(text);

CREATE FUNCTION public.get_admission_page(p_slug text)
RETURNS TABLE (
  admitted_name text,
  program_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- >>> WHITELIST PROJECTION — the only columns anon can ever receive >>>
  SELECT
    a.full_name AS admitted_name,
    o.title     AS program_title
  -- <<< WHITELIST PROJECTION <<<
  FROM public.cohort_applications a
  -- The offering is joined under the SAME predicate as the existing
  -- `offerings_public_read` policy (`TO anon USING (is_public = true AND status
  -- = 'active')`), restated inline because SECURITY DEFINER bypasses RLS. This
  -- function must never become a side door onto an unlisted offering's title.
  -- A LEFT JOIN so a private/inactive offering yields program_title = NULL and
  -- the page degrades to the cohort-agnostic celebratory frame instead of
  -- leaking or 404-ing.
  LEFT JOIN public.offerings o
    ON o.id = a.offering_id
   AND o.is_public = true
   AND o.status = 'active'
  WHERE p_slug IS NOT NULL
    AND length(p_slug) >= 32          -- reject probes that cannot be a real token
    AND a.admission_page_slug = p_slug
    AND a.admission_page_published_at IS NOT NULL  -- unpublish => zero rows => 404
    -- `status` is a LINEAR funnel, not a state flag: it advances PAST 'accepted'
    -- on its own the moment the student pays to claim the seat
    -- (`razorpay-webhook` writes 'confirmation_paid', then 'balance_paid', then
    -- 'enrolled'). Filtering on `status = 'accepted'` alone would therefore have
    -- silently 404'd every already-shared link at the exact moment the admission
    -- became MOST real — a second, invisible kill-switch contradicting the
    -- contract above that unpublishing is done through §5. So the filter is the
    -- accepted-or-BEYOND set, pinned in admissionPublicPolicy.test.ts. The two
    -- statuses that mean "no longer admitted" — 'rejected' and 'withdrawn' — are
    -- excluded by construction, and so is everything before the decision.
    -- Filter only; never an output column.
    AND a.status IN ('accepted', 'confirmation_paid', 'balance_paid', 'enrolled')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_admission_page(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admission_page(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_admission_page(text) IS
  'SEC-PUBLIC-1: the ONLY anon read path for an admission. Returns at most one row of {admitted_name, program_title} for a published application whose status is accepted or beyond. No dates, no contact details, no essay, no funnel state, no other row.';

-- ── 5. The publish / unpublish path ──────────────────────────────────────
-- Without these two writers nothing could ever set the marker, the feature
-- would be unreachable, and the acceptance criterion "unpublish → 404" could
-- not be exercised at all — least of all by the council, on a shadow project,
-- with a live anonymous probe. They are the callable surface an admin surface
-- or a service-role script publishes through. The shareable URL is
-- `<origin>/admission/<token>`; the app renders it at `/admission/:slug`.
--
-- AUTHORIZATION IS THE EXISTING POLICY, NOT A SECOND COPY OF IT. Both run
-- SECURITY INVOKER (stated explicitly, though it is the default) so the UPDATE
-- is filtered by whatever RLS already applies to the caller:
--   • an admin passes `admin_manage_applications` (FOR ALL) and the row updates;
--   • any other signed-in caller matches no writable row, so zero rows update
--     and the function returns NULL/false — a refusal, with no RAISE and no
--     information about whether the id exists;
--   • `anon` cannot reach them at all: no EXECUTE grant, and §3 leaves it no
--     table privilege to write through even if it could.
-- Re-deriving an admin check inside a SECURITY DEFINER body would have created a
-- second, drifting definition of "admin"; this way there is still exactly one.
--
-- SOR-1: neither function writes `status`. It is read as a precondition only,
-- against the same accepted-or-beyond set the reader uses, so a page can never
-- be published for someone who was not admitted.
--
-- DROP-then-CREATE for the same reason as §4: Postgres refuses to change an
-- existing function's return type in place, so a future edit to either shape
-- would otherwise fail mid-`db push` and take its siblings with it. The grants
-- go with the dropped function and are re-issued below.
DROP FUNCTION IF EXISTS public.publish_admission_page(uuid);
DROP FUNCTION IF EXISTS public.unpublish_admission_page(uuid);

CREATE FUNCTION public.publish_admission_page(p_application_id uuid)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  -- Idempotent: an already-published page keeps its token and its stamp, so
  -- calling this twice does not silently invalidate a link already shared.
  -- COALESCE short-circuits, so the minter only runs on first publish.
  UPDATE public.cohort_applications
     SET admission_page_slug = COALESCE(admission_page_slug, public.new_admission_page_slug()),
         admission_page_published_at = COALESCE(admission_page_published_at, now())
   WHERE id = p_application_id
     AND status IN ('accepted', 'confirmation_paid', 'balance_paid', 'enrolled')
  RETURNING admission_page_slug;
$$;

CREATE FUNCTION public.unpublish_admission_page(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  -- Clears BOTH columns: the stamp is what 404s the page, and dropping the
  -- token as well means a later republish mints a different one, so a link
  -- already pasted into a chat cannot be resurrected by re-publishing.
  -- No status precondition — taking a page down must never be blocked by where
  -- the applicant sits in the funnel.
  WITH cleared AS (
    UPDATE public.cohort_applications
       SET admission_page_slug = NULL,
           admission_page_published_at = NULL
     WHERE id = p_application_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM cleared);
$$;

REVOKE ALL ON FUNCTION public.publish_admission_page(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_admission_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_admission_page(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_admission_page(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.publish_admission_page(uuid) IS
  'Publishes the public admission page for one application and returns its share token; the URL is <origin>/admission/<token>. SECURITY INVOKER, so admin_manage_applications is the authorization. Idempotent, returns NULL when the caller may not write the row or the applicant is not admitted. Never writes status.';
COMMENT ON FUNCTION public.unpublish_admission_page(uuid) IS
  'Takes the public admission page down: clears the token and the publish stamp, so get_admission_page() returns zero rows and every shared link 404s. SECURITY INVOKER, so admin_manage_applications is the authorization. Never writes status.';

-- ── Reversal (kept for reference; do not run in the forward migration) ──
-- DROP FUNCTION IF EXISTS public.publish_admission_page(uuid);
-- DROP FUNCTION IF EXISTS public.unpublish_admission_page(uuid);
-- DROP FUNCTION IF EXISTS public.get_admission_page(text);
-- DROP FUNCTION IF EXISTS public.new_admission_page_slug();
-- DROP INDEX IF EXISTS public.uniq_cohort_apps_admission_page_slug;
-- ALTER TABLE public.cohort_applications
--   DROP CONSTRAINT IF EXISTS cohort_applications_admission_page_slug_check,
--   DROP COLUMN IF EXISTS admission_page_slug,
--   DROP COLUMN IF EXISTS admission_page_published_at;
-- The exact inverse of §3's `REVOKE ALL ... FROM anon` is the line below, NOT a
-- `GRANT SELECT`: what the REVOKE removes is Supabase's stock default-privilege
-- grant on `public` tables, which is ALL (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER), so restoring only SELECT would leave the table in a state
-- it was never in. Confirm the live grant set before relying on this:
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE grantee = 'anon' AND table_schema = 'public'
--      AND table_name = 'cohort_applications';
-- It is listed last and separately because it is the one step of the undo that
-- WIDENS access: RLS still admits anon to zero rows, but the guarantee in §3
-- goes with it. Run it only to restore the pre-migration grant state exactly, or
-- if some future anon path genuinely needs the table.
-- GRANT ALL ON TABLE public.cohort_applications TO anon;
