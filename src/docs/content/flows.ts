/**
 * User flows: every important journey through the app, grouped by
 * persona, ordered into a logical sequence.
 *
 * Each step has a real screenshot pair (desktop + mobile) captured
 * by scripts/capture_docs_screenshots.mjs against the running app
 * under /public/docs/screenshots/.
 *
 * Steps that map to external systems (Razorpay modal, Meta lead form,
 * webhook receiver, Supabase Studio) keep a placeholder.
 */
import type { Flow } from "../types";

const S = (slug: string) => ({
  desktop: `/docs/screenshots/${slug}-desktop.png`,
  mobile: `/docs/screenshots/${slug}-mobile.png`,
});

export const FLOWS: Flow[] = [
  /* ═══════════════════════════════════════════════════════════════
     STUDENT PERSPECTIVE: what the end-user experiences
     ═══════════════════════════════════════════════════════════════ */

  {
    slug: "student-onboarding",
    title: "Student · Onboarding (anon → enrolled)",
    audience: "student",
    summary: "Brand-new visitor → browse → pick an offering → log in with phone OTP → land on their authenticated home dashboard.",
    steps: [
      {
        title: "1. Browse the public catalogue",
        description: "Anonymous visitors hit /browse and see every public offering grouped by tier (Masterclass / Live Cohort / Workshop / Resources). Each card has hero art, price, and a CTA. UTM params from ad clicks are captured into crm_contacts for attribution.",
        screenshot: { ...S("browse"), placeholder: "Browse: public offering grid" },
      },
      {
        title: "2. Drill into an offering",
        description: "Clicking a card opens /offering/<slug>, the sales page. Hero video, what-you'll-learn rail, curriculum modules with free-preview chapters surfaced, instructor bio, social proof, FAQ. The CTA either jumps straight to /checkout or to /login first depending on the offering's gating.",
        screenshot: { ...S("offering-page"), placeholder: "Public offering sales page" },
      },
      {
        title: "3. Log in with phone OTP",
        description: "Returning students hit /login. Mobbin-grounded UX: a single cinematic still, 'What's your number?' headline, unified country pill, slide-left transition to the OTP screen. MSG91 delivers the 6-digit code; rate-limited at 5 attempts per 15 minutes via phone_otp_attempts.",
        screenshot: { ...S("login-step-1"), placeholder: "Login: phone entry" },
      },
      {
        title: "4. Razorpay checkout (external)",
        description: "Pay button → create-razorpay-order edge function returns order_id → Razorpay modal opens. UPI, card, netbanking, wallets all supported. Server-side webhook captures the payment, idempotently creates the enrolment row, queues the welcome email, and stamps the GST invoice PDF.",
        screenshot: { placeholder: "Razorpay Standard Checkout (external)" },
      },
      {
        title: "5. Authenticated home",
        description: "After login (or post-purchase auto-create), /home is the student's dashboard: a 'Pick up where you left off' hero pulled from the last-watched chapter, a Continue Learning rail across every enrolled course, a Browse strip, and quick links to Sessions + Community + Profile. Mobile uses a bottom tab bar.",
        screenshot: { ...S("home"), placeholder: "Authenticated home dashboard" },
      },
    ],
  },

  {
    slug: "student-learn",
    title: "Student · Learn (watch + take notes + ask)",
    audience: "student",
    summary: "Inside an enrolment: course detail → chapter viewer → notes + Q&A → next chapter.",
    steps: [
      {
        title: "1. Continue from home",
        description: "Home's 'Pick up where you left off' card jumps directly to the chapter the student last paused on. Their progress (watched seconds + completion %) is per-chapter, cross-device.",
        screenshot: { ...S("home"), placeholder: "Home: Continue Learning rail" },
      },
      {
        title: "2. Chapter viewer (placeholder)",
        description: "ChapterViewer plays the VdoCipher DRM stream with custom thumbnail, chapter sidebar, Up Next list with thumbnails + descriptions, Q&A tab, and a notes drawer. Notes are stored in chapter_notes (RLS scoped to the student) so they sync across web, iOS, and Android.",
        screenshot: { placeholder: "VdoCipher chapter player + notes drawer (auth-gated, captured separately)" },
      },
      {
        title: "3. Community feed",
        description: "Between watches, students chat in /community. Three scopes: Everyone (app-wide), My Cohort (members-only feed, scoped by cohort_batch_id), and Peer Reviews (cohort-mates' opted-in assignments surfaced for critique).",
        screenshot: { ...S("community-everyone"), placeholder: "Community: Everyone scope" },
      },
      {
        title: "4. My Cohort scope",
        description: "Live-cohort enrolees switch to My Cohort to talk privately with their batch, same UI, scoped feed. Mute-thread (localStorage) keeps notifications under control.",
        screenshot: { ...S("community-my-cohort"), placeholder: "Community: My Cohort scope" },
      },
      {
        title: "5. Peer Reviews",
        description: "The Peer Reviews scope replaces the post composer with the PeerReviewBoard: cohort-mates' submissions that opted in to peer feedback. Click any card → drawer with critique textarea, 5-star rating, save-as-draft, and the original submission inline.",
        screenshot: { ...S("community-peer-reviews"), placeholder: "Community: Peer Reviews board" },
      },
      {
        title: "6. Profile",
        description: "Edit display name + bio + avatar, manage opt-ins for email / WhatsApp / SMS, view full purchase history, request account deletion. Self-managed; admins see this in /admin/users.",
        screenshot: { ...S("profile"), placeholder: "Profile" },
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════════
     ADMIN PERSPECTIVE: every screen behind /admin
     ═══════════════════════════════════════════════════════════════ */

  {
    slug: "admin-overview",
    title: "Admin · Overview (dashboard + revenue)",
    audience: "admin",
    summary: "Where you start every admin session: dashboard for the live KPI picture, revenue for the money detail.",
    steps: [
      {
        title: "1. Dashboard",
        description: "/admin shows the live KPIs across the date range you select (Today / This Week / This Month / Past 30 Days / Custom): students, active enrolments, active offerings, total revenue. Daily Signups chart + Course Completion Rates table + Offering Performance feed below.",
        screenshot: { ...S("admin-dashboard"), placeholder: "Admin dashboard" },
      },
      {
        title: "2. Revenue: combined live + legacy",
        description: "/admin/revenue. Top strip: 'Combined revenue (live + legacy)' showing total ₹X across all-time from this app + 73,926 TagMango legacy_enrolments. KPI cards split out: Live (this app), Legacy (TagMango), Refunded. Sub-strip below: filtered-window cards from in-memory orders. Per-tier breakdown, top buyers, CSV export, refund issuance.",
        screenshot: { ...S("admin-revenue"), placeholder: "Revenue page with combined + filtered cards" },
      },
    ],
  },

  {
    slug: "admin-content",
    title: "Admin · Content (offerings + courses + chapters)",
    audience: "admin",
    summary: "Set up what students can buy and what they watch. Three linked layers: offerings (the SKU), courses (the container), chapters (the atomic units).",
    steps: [
      {
        title: "1. Hero slides",
        description: "/admin/hero-slides controls the rotating banner on /browse and /home. Set image, title, subtitle, CTA URL, sort order, schedule_from / schedule_to.",
        screenshot: { ...S("admin-hero-slides"), placeholder: "Hero slides admin" },
      },
      {
        title: "2. Offerings list",
        description: "/admin/offerings: every SKU. Sortable + filterable by status (draft/active/archived) and tier (masterclass/cohort/workshop/bundle). Click 'New' to create or click any row to edit.",
        screenshot: { ...S("admin-offerings"), placeholder: "Offerings list" },
      },
      {
        title: "3. Offering editor",
        description: "Full edit form for one offering: slug, title, subtitle, price_inr, mrp_inr, type, payment_mode (one_time / cohort / subscription), gst_mode, hero + thumbnail + banner uploads, instructor bio, FAQs, refund_policy_days, attendance_threshold_pct, checkout testimonials + bullets + guarantee text. Razorpay test-mode toggle for safe rehearsals.",
        screenshot: { ...S("admin-offerings-editor"), placeholder: "Offering editor" },
      },
      {
        title: "4. Courses list",
        description: "/admin/courses: the container that holds chapters. Each offering links to one course via offering_courses. Click a course to open its curriculum editor.",
        screenshot: { ...S("admin-courses"), placeholder: "Courses list" },
      },
      {
        title: "5. Course curriculum editor",
        description: "/admin/courses/:id/curriculum. Add chapters per section. For each chapter: title, VdoCipher video ID (auto-fetches duration + thumbnail), content_type (video/pdf/article/quiz/assignment), is_free toggle for anon-playable previews, drag to reorder.",
        screenshot: { ...S("admin-course-curriculum"), placeholder: "Curriculum editor" },
      },
      {
        title: "6. Admin community view",
        description: "/admin/community shows the same community feed students see, plus moderation tools: pin, hide, delete posts/comments. Admin posts are tagged with the Admin badge.",
        screenshot: { ...S("admin-community"), placeholder: "Admin community moderation" },
      },
    ],
  },

  {
    slug: "admin-scheduling",
    title: "Admin · Scheduling (sessions + events + cohorts)",
    audience: "admin",
    summary: "Three calendars: live class sessions, public events, and the week-by-week cohort backbone.",
    steps: [
      {
        title: "1. Schedule live sessions",
        description: "/admin/schedule. Calendar + list of live_sessions. Each tied to a cohort_batch_id + an offering_id. Set starts_at, duration_min, host, meeting link (Zoom / Google Meet). Attendance is keyed off these rows.",
        screenshot: { ...S("admin-schedule"), placeholder: "Schedule" },
      },
      {
        title: "2. Events",
        description: "/admin/events: public-facing events (free webinars, AMAs, demo days). Sales page, RSVP form, calendar invite via .ics, post-event recording link.",
        screenshot: { ...S("admin-events"), placeholder: "Events" },
      },
      {
        title: "3. Cohorts list",
        description: "/admin/cohorts. Every cohort_batch (Edition 9 Jaipur, BFP Sept 2026, etc.). Click a batch → manage week-by-week curriculum.",
        screenshot: { ...S("admin-cohorts"), placeholder: "Cohorts" },
      },
      {
        title: "4. Cohort submissions inbox",
        description: "/admin/cohort-submissions. Every assignment a student submitted across all active batches. Filter by batch, week, status (submitted/reviewed/revised). Open one → review form with feedback_text + status flip + email/WhatsApp ping to the student.",
        screenshot: { ...S("admin-cohort-submissions"), placeholder: "Cohort submissions inbox" },
      },
    ],
  },

  {
    slug: "admin-people",
    title: "Admin · People (applications + enrolments + users)",
    audience: "admin",
    summary: "Manage who's applied, who has access, and the master user table, including the 60K+ legacy phantom users.",
    steps: [
      {
        title: "1. Applications inbox",
        description: "/admin/applications. Cohort-application form responses from prospective students. Approve → outreach email fires + crm_contacts row created with status='qualified'. Reject → archived.",
        screenshot: { ...S("admin-applications"), placeholder: "Applications inbox" },
      },
      {
        title: "2. Enrolments: live + legacy unified",
        description: "/admin/enrolments. Reads from enrolments_unified view which UNIONs live enrolments (this app) + legacy_enrolments (TagMango era). Each row has an enrolment_kind column. Grant/revoke access, filter by status / offering / course, export CSV.",
        screenshot: { ...S("admin-enrolments"), placeholder: "Enrolments unified" },
      },
      {
        title: "3. Users: 60,648 across new + legacy",
        description: "/admin/users now reads users_unified: every real user PLUS every distinct phantom legacy customer (one row per legacy phone with no matching users row). Phantom rows have an italic 'unclaimed legacy' name + phone. Default sort by lifetime_revenue_inr DESC so biggest TagMango customers (₹2.7L LTV) top the list.",
        screenshot: { ...S("admin-users"), placeholder: "Users unified" },
      },
      {
        title: "4. Coupons",
        description: "/admin/coupons. Discount codes, percent or flat. max_redemptions + valid_until. applies_to_offering_id NULL = applies to everything. Used_count + total_discount_given auto-tracked on payment_orders captures.",
        screenshot: { ...S("admin-coupons"), placeholder: "Coupons" },
      },
      {
        title: "5. Certificates",
        description: "/admin/certificates. Per-offering completion certificate templates: design + variable positions (name, course, date). Auto-generate PDF on completion threshold. /admin/certificate-template-editor for visual layout.",
        screenshot: { ...S("admin-certificates"), placeholder: "Certificates" },
      },
      {
        title: "6. Legacy program mappings",
        description: "/admin/legacy-mappings. 779 TagMango program names still need an offering_id mapped. Per program: Map (links to an offering + retro-grants every matching legacy_enrolment to the corresponding user when they sign in) or Skip (refunded/test data, ignored forever).",
        screenshot: { ...S("admin-legacy-mappings"), placeholder: "Legacy program mappings" },
      },
    ],
  },

  {
    slug: "admin-comms",
    title: "Admin · Communications (announcements + email)",
    audience: "admin",
    summary: "Reach students: community announcements, email templates, bulk campaigns.",
    steps: [
      {
        title: "1. Announcements composer",
        description: "/admin/announcements. Broadcast a community post with an Admin badge, optionally pinned. Cohort-scoped (specific batch) or app-wide. Optional push notification + email fan-out.",
        screenshot: { ...S("admin-announcements"), placeholder: "Announcements" },
      },
      {
        title: "2. Email templates",
        description: "/admin/email-templates. Brevo transactional templates. key (slug used in code), subject, html_body with {{first_name}}-style interpolation. is_active toggle stops sending mid-flight. Used by edge functions: welcome_email, refund_processed, certificate_issued, cohort_assignment_due_24h, etc.",
        screenshot: { ...S("admin-email-templates"), placeholder: "Email templates" },
      },
      {
        title: "3. Email campaigns",
        description: "/admin/email-campaigns. Build an audience (filter by enrolment + tag + opt-in), pick a template, schedule a send. Honors user_marketing_prefs opt-out. Throttled to Brevo rate limits with a queue worker.",
        screenshot: { ...S("admin-email-campaigns"), placeholder: "Email campaigns" },
      },
    ],
  },

  {
    slug: "admin-api",
    title: "Admin · API & integrations (/admin/api)",
    audience: "admin",
    summary: "Five tabs let your Founders Office team and AI agents drive the entire app without ever touching the codebase.",
    steps: [
      {
        title: "1. Keys",
        description: "Issue per-teammate / per-tool keys with read / write / admin scope. Plaintext shown only once at creation. Revoke clicks one button, and anything using the key stops working within seconds.",
        screenshot: { ...S("admin-api-keys"), placeholder: "API keys" },
      },
      {
        title: "2. Install",
        description: "Three setup paths: CLI for shell + scripts, MCP for AI agents (Claude Desktop / Claude Code / Cursor), curl/HTTP for Zapier + n8n + custom code. Per-key 'download icon' on each row opens a key-scoped install dialog.",
        screenshot: { ...S("admin-api-install"), placeholder: "Install instructions" },
      },
      {
        title: "3. Webhooks",
        description: "Subscribe external systems (HubSpot / Zapier / Make / n8n) to events: user.created, enrolment.granted, crm_contact.created, crm_contact.converted. HMAC-signed. Built-in 'test ping' button does a real POST and returns delivered/failed inline.",
        screenshot: { ...S("admin-api-webhooks"), placeholder: "Webhooks" },
      },
      {
        title: "4. Activity",
        description: "Last 200 API calls with action, status code, latency, IP, error. Filter by action or status. Audit trail for compliance + debugging which scripts are noisy.",
        screenshot: { ...S("admin-api-activity"), placeholder: "API call log" },
      },
      {
        title: "5. Surface",
        description: "Auto-fetched catalogue of all 74 actions grouped by namespace (offerings / users / leads / payments / campaigns / webhooks / keys / analytics …). Copy a curl recipe for any action with one click.",
        screenshot: { ...S("admin-api-surface"), placeholder: "Action surface" },
      },
    ],
  },

  {
    slug: "admin-docs",
    title: "Admin · Documentation portal (/admin/docs)",
    audience: "admin",
    summary: "World-class docs you're reading right now. Seven tabs, searchable, exportable as markdown or PDF.",
    steps: [
      {
        title: "1. Overview",
        description: "Plain-prose introduction: what LevelUp is, the four pillars, who uses the app, the tech stack. Where you point a new teammate first.",
        screenshot: { ...S("admin-docs-overview"), placeholder: "Docs · Overview" },
      },
      {
        title: "2. Features catalogue",
        description: "Every capability with a status badge: Shipped / Partial / Planned / Deprecated. Filter by clicking the count cards. Each feature shows code refs + clickable app links. Date filter on the shipped_at field so you can see what landed in a window.",
        screenshot: { ...S("admin-docs-features"), placeholder: "Docs · Features" },
      },
      {
        title: "3. Flows (this tab)",
        description: "Step-by-step user journeys by persona with screenshots. Mobile ↔ Desktop toggle. Carousel per flow. 'Download as PDF' button at the top produces a polished printable PDF with screenshots embedded.",
        screenshot: { ...S("admin-docs-flows"), placeholder: "Docs · Flows" },
      },
      {
        title: "4. Tech",
        description: "Architecture + stack + deployment + integrations + secrets reference. Linked subsection sidebar.",
        screenshot: { ...S("admin-docs-tech"), placeholder: "Docs · Tech" },
      },
      {
        title: "5. Schema",
        description: "30+ public.* tables documented with purpose, key columns, relationships. Collapsible details per table. Filter by table name or column.",
        screenshot: { ...S("admin-docs-schema"), placeholder: "Docs · Schema" },
      },
      {
        title: "6. API",
        description: "Endpoint + CLI + MCP reference. Live-loaded list of all 74 actions grouped by namespace, sourced from system.list_actions at render time.",
        screenshot: { ...S("admin-docs-api"), placeholder: "Docs · API" },
      },
      {
        title: "7. Changelog",
        description: "Human-readable change log from the doc_changelog table. Hand-written entries, not auto-generated from git. Date filter (Today / Yesterday / 7d / 30d / Custom range) so you can see exactly what shipped in a window.",
        screenshot: { ...S("admin-docs-changelog"), placeholder: "Docs · Changelog" },
      },
    ],
  },

  {
    slug: "admin-system",
    title: "Admin · System (audit + roles + analytics)",
    audience: "admin",
    summary: "Things you touch rarely, but critical when you do.",
    steps: [
      {
        title: "1. Audit logs",
        description: "/admin/audit-logs. Every admin_audit_logs row: who did what when. User edits, role changes, refunds, deletes. Mandatory for SOC-2 prep + customer support disputes.",
        screenshot: { ...S("admin-audit-logs"), placeholder: "Audit logs" },
      },
      {
        title: "2. Roles",
        description: "/admin/roles. The 5 admin role gates (owner / admin / author / support / instructor) + student. Per-route access map shown so it's obvious who can see what. Owner is never demotable (DB trigger enforces).",
        screenshot: { ...S("admin-roles"), placeholder: "Roles" },
      },
      {
        title: "3. Analytics settings",
        description: "/admin/analytics-settings. Per-environment enable toggle + ID for: Meta Pixel, GA4, Microsoft Clarity, Twitter (X) Pixel. Loaded by src/lib/analytics.ts at first page hit. Server-side Meta CAPI dedup keyed on event_id.",
        screenshot: { ...S("admin-analytics-settings"), placeholder: "Analytics settings" },
      },
    ],
  },

  /* ═══════════════════════════════════════════════════════════════
     INSTRUCTOR / TEACHER PERSPECTIVE
     ═══════════════════════════════════════════════════════════════ */

  {
    slug: "instructor",
    title: "Instructor · Teach + review (subset of /admin)",
    audience: "instructor",
    summary: "Instructors land in the same /admin shell but canAccessRoute restricts their nav to Dashboard, Schedule, and Cohorts. They teach + grade, they don't manage the SKU catalogue or finances.",
    steps: [
      {
        title: "1. Dashboard (instructor scope)",
        description: "Same /admin route as owner/admin, same KPI cards, but the left-rail nav only renders the items the instructor role is allowed: Overview · Dashboard, Scheduling · Schedule Classes / Events / Cohorts. Everything else (Revenue, Users, Offerings, API, Docs) is hidden, both UI-side via filteredNavGroups and DB-side via RLS.",
        screenshot: { ...S("admin-dashboard"), placeholder: "Admin dashboard: instructor sees the same body but a smaller sidebar" },
      },
      {
        title: "2. Schedule live sessions",
        description: "/admin/schedule. Instructors set up their own live_sessions for cohorts they're assigned to. Same UI as the admin view: calendar + form.",
        screenshot: { ...S("admin-schedule"), placeholder: "Schedule" },
      },
      {
        title: "3. Cohort week + submissions",
        description: "/admin/cohorts → pick a batch → review the week-by-week curriculum and the student submissions. Mentor feedback flow: open submission → write feedback_text → mark reviewed → student sees it in their /cohort dashboard and gets the cohort_submission_reviewed email.",
        screenshot: { ...S("admin-cohort-submissions"), placeholder: "Cohort submissions inbox" },
      },
    ],
  },
];
