-- Human-readable changelog for the LevelUp app.
--
-- Goal: any non-developer should be able to open /admin/docs → Changelog
-- and understand what changed and when, without reading git history or
-- code. This complements (does NOT replace) git commits — the table is
-- prose-first.
--
-- Entry shape:
--   title         — short headline, sentence-cased
--   summary       — 1-2 sentences a non-dev understands
--   area          — coarse grouping (Auth, Cohort, Payment, Admin, …)
--   status        — 'shipped' | 'partial' | 'planned' | 'deprecated'
--   shipped_at    — when it went live (NULL if planned)
--   version       — optional semver-ish tag
--   body_md       — long-form details / context / rollout notes
--   author        — display name (e.g. "Rahul + Claude") — not an FK
--   user_facing   — true if students/users notice, false for internal
--                   plumbing
--   created_at / updated_at — bookkeeping

CREATE TABLE IF NOT EXISTS public.doc_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
  area text NOT NULL,
  status text NOT NULL DEFAULT 'shipped'
    CHECK (status IN ('shipped','partial','planned','deprecated')),
  shipped_at timestamptz,
  version text,
  body_md text,
  author text NOT NULL DEFAULT 'Rahul + Claude',
  user_facing boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doc_changelog_shipped_at_idx ON public.doc_changelog (shipped_at DESC NULLS LAST);
CREATE INDEX doc_changelog_area_idx ON public.doc_changelog (area);
CREATE INDEX doc_changelog_status_idx ON public.doc_changelog (status);

CREATE TRIGGER doc_changelog_updated_at BEFORE UPDATE ON public.doc_changelog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.doc_changelog ENABLE ROW LEVEL SECURITY;

-- Admins manage everything
CREATE POLICY doc_changelog_admin_all ON public.doc_changelog
  USING (is_admin()) WITH CHECK (is_admin());

-- Authenticated users (incl students) can read user-facing entries —
-- useful if we later expose a public changelog page to students.
CREATE POLICY doc_changelog_public_read ON public.doc_changelog FOR SELECT
  USING (user_facing = true);

-- Seed the changelog with the last 7 days of major work so /admin/docs
-- → Changelog is populated on first open. Each entry is hand-written
-- for non-developers — what changed, why, what students feel.

INSERT INTO public.doc_changelog (title, summary, area, status, shipped_at, version, user_facing, body_md, author) VALUES
('Documentation portal at /admin/docs',
 'A world-class, searchable in-app documentation: features, architecture, schema, API, flows, and this changelog. Downloadable as a single markdown for sharing with any AI assistant.',
 'Admin', 'shipped', '2026-05-27 22:00+05:30', 'v3.1', false,
 'Built so the founders office and any new dev can ramp in minutes instead of days. Modeled on Stripe + Linear docs. Screenshots toggle between mobile and desktop, search is per-tab, and the full content can be exported to feed any LLM.',
 'Rahul + Claude'),

('Admin API + CLI + MCP for the team',
 'A single edge-function endpoint that exposes 74 actions — list/create/edit offerings, courses, chapters, events, enrolments, users, leads, payments, campaigns, webhooks. Plus a Node CLI (`levelup …`) and an MCP server so AI agents can drive the app.',
 'Admin', 'shipped', '2026-05-26 23:00+05:30', 'v2.0', false,
 'No more "ask an engineer to edit the DB". The Founders Office team can list offerings, grant enrolments, pull revenue snapshots, trigger emails, capture leads, all via curl, Postman, Zapier, n8n, or AI agents. Three scope levels (read/write/admin), bcrypt-hashed keys, audit log on every call.',
 'Rahul + Claude'),

('Marketing + CRM surface on the API',
 'The admin API now covers the marketing team and any CRM/automation tool: lead capture (idempotent), tags, notes, opt-in/out, email + WhatsApp campaign triggers, webhook subscriptions to push events to Zapier/HubSpot/anywhere.',
 'Marketing', 'shipped', '2026-05-26 23:15+05:30', 'v2.0', false,
 'When a new lead lands or a purchase happens, the webhook fires and your CRM is updated automatically. Bulk-import 500 leads from a CSV in one API call. Tag a power user once and target them later.',
 'Rahul + Claude'),

('Legacy users baked into Users tab',
 'The 1,070+ TagMango legacy customers are now visible alongside new app users with a "Legacy" badge. New filters: All / Active / Legacy and program vertical (Forge / Live / Masterclass / Workshop). New columns: City, Vertical, lifetime revenue.',
 'Admin', 'shipped', '2026-05-26 23:45+05:30', NULL, false,
 'No more "is this person new or did they come from TagMango?" guesswork. The migration adds 9 new columns to users (city, state, program_vertical, lifetime_revenue_inr, etc.) and a backfill script reads the Customer Brain v3 spreadsheet to populate them as legacy customers sign in.',
 'Rahul + Claude'),

('TagMango-grade Revenue page',
 'Revenue now has the same date filters TagMango operators are used to: Today, Yesterday, 7 days, 30 days, 90 days, All time, and Custom date range. New "Top buyers in this window" panel shows who is spending the most.',
 'Admin', 'shipped', '2026-05-26 23:50+05:30', NULL, false,
 'Three new database functions (revenue_in_range, revenue_daily, revenue_by_user_in_range) power this. Same UX an operator expects from any well-built CRM/admin tool.',
 'Rahul + Claude'),

('Peer Review composer in /community',
 'Cohort students can now critique each other''s submitted assignments directly from /community. A new "Peer Reviews" toggle next to Everyone / My Cohort shows opted-in work; clicking opens a drawer with the submission, a 5-star rating, a critique textarea, and a save-as-draft option.',
 'Cohort', 'shipped', '2026-05-26 23:30+05:30', NULL, true,
 'Critique sharpens your own eye. The composer is reachable from both /cohort/<slug> and /community, with the same UX in both places.',
 'Rahul + Claude'),

('Cohort dashboard + assignment loop + attendance gating',
 'The 12-week live cohort experience: a per-student dashboard with current-week assignment, submission form, mentor feedback panel, attendance gating, and email + WhatsApp reminders fired by pg_cron.',
 'Cohort', 'shipped', '2026-05-26 21:00+05:30', NULL, true,
 'The retention literature is unanimous: 8-12 week cohorts hemorrhage between weeks 3 and 6 without active prompts. The notify-cohort edge function scans every 15 minutes and pings members who haven''t submitted, with 24h-before-due and 1h-before-session windows.',
 'Rahul + Claude'),

('Login flow refactor with cinematic still',
 'The login page is now grounded in Mobbin masterclass patterns: a single cinematic OpenAI gpt-image-2 hero, "What''s your number?" headline, unified country pill on the phone input, slide-left transition between steps. The four-image carousel is gone.',
 'Auth', 'shipped', '2026-05-26 18:00+05:30', NULL, true,
 'Lower friction, clearer affordance, and a brand-on visual. The carousel was distracting; the single still anchors attention.',
 'Rahul + Claude'),

('Phase 2 video migration: 350 chapters re-hosted',
 'All 214 TagMango video URLs from the migration are now hosted on our own Supabase Storage bucket. The migration uses TUS resumable upload for files >1GB. 34 FairPlay-blocked chapters across 13 courses are documented and bundled into a PDF for TagMango Support to re-export.',
 'Content', 'shipped', '2026-05-26 06:00+05:30', NULL, false,
 'Independent of TagMango long-term — if they pull the rug, the content stays. FairPlay-encrypted assets cannot be downloaded by us; the support PDF (in Downloads) lists every chapter we need re-exported.',
 'Rahul + Claude'),

('Owner role enabled across the app',
 'Admin permissions now correctly recognise the "owner" role (CEO + co-founders). Previously the role was excluded from ADMIN_ROLES which caused 403s on refunds, deletes, bulk emails, vdocipher uploads, etc.',
 'Auth', 'shipped', '2026-05-26 14:00+05:30', NULL, false,
 'Fixed in 6 edge functions (process-refund, delete-account, send-notification, send-bulk-email, get-vdocipher-otp, vdocipher-upload-credential) and src/lib/permissions.ts.',
 'Rahul + Claude'),

('Razorpay duplicate-purchase guard',
 'Users cannot accidentally buy the same offering twice. The create-razorpay-order function now checks for an active enrolment before creating a new order. Cohorts students get a clear "you already own this" message.',
 'Payment', 'shipped', '2026-05-26 13:30+05:30', NULL, true,
 'Triggered by the ₹1 double-charge on Lokesh''s test masterclass. The guard now blocks the second charge at the order-creation step.',
 'Rahul + Claude'),

('Phase 1: Storefront + Checkout v2',
 'The public offering and checkout pages were rebuilt: cleaner above-the-fold, real-time price + coupon updates, guest checkout (ad traffic doesn''t hit a login wall), trust panel, Razorpay test mode toggle for admins.',
 'Storefront', 'shipped', '2026-05-22 18:00+05:30', NULL, true,
 'Built off the A1/A2/A3 Mobbin research synthesis. The guest checkout fix specifically helps Meta/Google ad campaigns convert without forcing a sign-up first.',
 'Rahul + Claude'),

('Analytics: Meta Pixel + GA4 + Clarity + Twitter Pixel',
 'All four analytics platforms now fire on the public-facing pages. Server-side Meta CAPI events use a deduplicated event ID so the browser pixel + server event don''t double-count.',
 'Analytics', 'shipped', '2026-05-23 10:00+05:30', NULL, false,
 'Configurable from /admin/analytics-settings. Real-time event firing verified on production.',
 'Rahul + Claude'),

('Q&A revival on chapter player',
 'Students can ask + answer questions on any chapter. Comments thread per chapter with admin badge, upvote, and rich-text support.',
 'Content', 'shipped', '2026-05-23 16:00+05:30', NULL, true,
 'Was wired up in the DB but dormant in the UI. Brought back live.',
 'Rahul + Claude'),

('iOS Capacitor shell + Path B compliance',
 'iOS app shell is built with Capacitor. Apple Reader Rule compliant — payments stay on the web, the app reads only.',
 'Platform', 'shipped', '2026-05-23 22:00+05:30', NULL, true,
 'Lets us list on the App Store later without giving Apple a 30% cut on web-paid subscriptions. The Android Path B variant follows the same model.',
 'Rahul + Claude');
