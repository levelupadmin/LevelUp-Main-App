/**
 * User flows — every important journey through the app, step-by-step.
 *
 * Each step has a real screenshot pair (desktop + mobile). Steps that
 * correspond to external systems (Razorpay modal, Meta lead form,
 * webhook receiver) keep a placeholder.
 *
 * Screenshots live under /public/docs/screenshots/ so they're served
 * by Vite as static assets and don't bloat the JS bundle.
 *
 * Audience is who walks through this flow in real life.
 */
import type { Flow } from "../types";

const S = (slug: string) => ({
  desktop: `/docs/screenshots/${slug}-desktop.png`,
  mobile: `/docs/screenshots/${slug}-mobile.png`,
});

export const FLOWS: Flow[] = [
  {
    slug: "student-signup-to-purchase",
    title: "Student: signup → purchase → first watch",
    audience: "student",
    summary: "The full happy path from a Meta ad click all the way to a student watching their first chapter. Screenshots show real pages in production.",
    steps: [
      {
        title: "1. Browse + discover an offering",
        description: "Visitor lands on /browse — the public catalogue. Filters by product tier (masterclass / live cohort / workshop). Each card shows hero, price, and a CTA. UTM params from ad clicks are captured for attribution.",
        screenshot: { ...S("browse"), placeholder: "Browse page with offering grid" },
      },
      {
        title: "2. Login + phone OTP",
        description: "Clicking 'Sign in' or hitting a gated page lands them here. Mobbin-grounded UX — single cinematic still, 'What's your number?' headline, unified country pill, slide-left transition between phone-entry and OTP-verify.",
        screenshot: { ...S("login"), placeholder: "Login page with cinematic still" },
      },
      {
        title: "3. Home — what they own",
        description: "After login, /home shows their entitled offerings (purchased + admin-granted + legacy-claimed). Continue Watching strip + Up Next chapters across courses they're enrolled in.",
        screenshot: { ...S("home"), placeholder: "Authenticated home dashboard" },
      },
      {
        title: "4. Razorpay modal (external)",
        description: "Pay button → create-razorpay-order edge function returns order_id → Razorpay modal opens. UPI, card, netbanking, wallets all supported. Webhook captures payment + auto-creates the enrolment + queues the welcome email + generates the GST invoice PDF.",
        screenshot: { placeholder: "Razorpay standard checkout modal (external)" },
      },
      {
        title: "5. Community — talk to your people",
        description: "Once enrolled, students get into /community. Three scopes: Everyone (app-wide), My Cohort (members-only), Peer Reviews (cohort-mates' opted-in assignments). Posts + threaded comments + ❤️ likes + mute-thread.",
        screenshot: { ...S("community-everyone"), placeholder: "Community feed" },
      },
      {
        title: "6. Profile",
        description: "Edit name + bio + avatar, manage email/WhatsApp/SMS opt-ins, view purchase history, request account deletion.",
        screenshot: { ...S("profile"), placeholder: "Profile page" },
      },
    ],
  },
  {
    slug: "admin-launch-offering",
    title: "Admin: launch a new masterclass / cohort",
    audience: "admin",
    summary: "Walking through the admin dashboard from green-field to a published, purchasable offering.",
    steps: [
      {
        title: "1. Admin Dashboard",
        description: "Single-page summary: live KPIs (revenue, students, refunds), top offerings, recent activity. Click into Offerings to start.",
        screenshot: { ...S("admin-dashboard"), placeholder: "Admin dashboard with KPI cards" },
      },
      {
        title: "2. Offerings list",
        description: "/admin/offerings — every offering, sortable + filterable by status (draft/active/archived) + tier. Click an offering to edit or 'New' to create.",
        screenshot: { ...S("admin-offerings"), placeholder: "Offerings list" },
      },
      {
        title: "3. Curriculum editor",
        description: "/admin/courses → each offering has a curriculum. Add chapters: title, VdoCipher video ID, content type (video/pdf/article/quiz). Drag to reorder. Mark `is_free` on preview chapters.",
        screenshot: { ...S("admin-courses"), placeholder: "Curriculum editor" },
      },
      {
        title: "4. Cohort weeks (for live cohorts)",
        description: "/admin/cohorts → per-offering admin defines week-by-week curriculum, assignments + due dates + live session calendar. pg_cron picks up due dates and fires email + WhatsApp reminders.",
        screenshot: { ...S("admin-cohorts"), placeholder: "Cohort weeks editor" },
      },
      {
        title: "5. Coupons (optional)",
        description: "/admin/coupons → set up discount codes (percent / flat). max_redemptions + valid_until. Validated client-side AND server-side at checkout.",
        screenshot: { ...S("admin-coupons"), placeholder: "Coupons admin" },
      },
      {
        title: "6. Applications inbox (cohort flow)",
        description: "/admin/applications → form responses from prospective cohort students. Approve → outreach email fires + crm_contacts row created.",
        screenshot: { ...S("admin-applications"), placeholder: "Applications inbox" },
      },
    ],
  },
  {
    slug: "admin-people-money",
    title: "Admin: people + money management",
    audience: "admin",
    summary: "Who's enrolled, who paid what, who's a legacy customer — surfaced in three tightly-linked pages.",
    steps: [
      {
        title: "1. Users — new + legacy in one view",
        description: "/admin/users → every user with a 'Type' column (Legacy / Active), city, vertical, lifetime revenue, and enrolment counts (live + legacy). Filters: scope (all/active/legacy) + program vertical.",
        screenshot: { ...S("admin-users"), placeholder: "Users page with legacy badges" },
      },
      {
        title: "2. Enrolments",
        description: "/admin/enrolments → grant or revoke access. Each row shows user + offering + source (checkout / admin_grant / legacy_claim) + total_paid.",
        screenshot: { ...S("admin-enrolments"), placeholder: "Enrolments admin" },
      },
      {
        title: "3. Revenue — TagMango-grade date filters",
        description: "/admin/revenue → Today / Yesterday / 7d / 30d / 90d / All Time / Custom. KPI cards (gross / net / orders / unique buyers), per-offering breakdown, top buyers in the window, CSV export, refund issuance.",
        screenshot: { ...S("admin-revenue"), placeholder: "Revenue page" },
      },
    ],
  },
  {
    slug: "founders-office-api-tour",
    title: "Founders Office: API + CLI + MCP tour",
    audience: "admin",
    summary: "Five tabs at /admin/api let your team and AI agents drive the entire app without ever touching the codebase.",
    steps: [
      {
        title: "1. Keys tab",
        description: "Issue per-teammate / per-tool API keys with read / write / admin scope. Plaintext shown only once. Revoke any key with one click — everything downstream stops working within seconds.",
        screenshot: { ...S("admin-api-keys"), placeholder: "API keys management" },
      },
      {
        title: "2. Install tab",
        description: "Three install paths — CLI for shell + scripts, MCP for AI agents (Claude Desktop / Claude Code / Cursor), curl/HTTP for Zapier + n8n + custom code. Every key has a 'download icon' on its row that opens a scoped install dialog.",
        screenshot: { ...S("admin-api-install"), placeholder: "Install instructions" },
      },
      {
        title: "3. Webhooks tab",
        description: "Subscribe external systems (Zapier / Make / n8n / HubSpot) to events: user.created, enrolment.granted, crm_contact.created, crm_contact.converted. HMAC-signed. Built-in 'test ping' button does a real POST and returns delivered/failed.",
        screenshot: { ...S("admin-api-webhooks"), placeholder: "Webhooks management" },
      },
      {
        title: "4. Activity tab",
        description: "Last 200 API calls with action, status code, latency, IP, error. Filter by action or status. Audit trail for compliance + debugging.",
        screenshot: { ...S("admin-api-activity"), placeholder: "API call log" },
      },
      {
        title: "5. Surface tab",
        description: "Auto-fetched catalogue of all 74 actions grouped by namespace (offerings / users / leads / payments / campaigns / webhooks / keys / analytics …). Copy a curl recipe for any action with one click.",
        screenshot: { ...S("admin-api-surface"), placeholder: "Action surface browser" },
      },
    ],
  },
  {
    slug: "marketing-comms",
    title: "Marketing: campaigns + announcements",
    audience: "marketing",
    summary: "How marketing reaches students — email templates + bulk campaigns + community announcements.",
    steps: [
      {
        title: "1. Email templates",
        description: "/admin/email-templates → Brevo-backed transactional templates. Subject + HTML body with {{first_name}}-style interpolation. is_active toggle stops sending mid-campaign.",
        screenshot: { ...S("admin-email-templates"), placeholder: "Email templates editor" },
      },
      {
        title: "2. Email campaigns",
        description: "/admin/email-campaigns → pick a template + filter an audience + send. Honors user_marketing_prefs opt-out. Throttled to Brevo rate limits.",
        screenshot: { ...S("admin-email-campaigns"), placeholder: "Email campaigns" },
      },
      {
        title: "3. Community announcements",
        description: "/admin/announcements → broadcast a message to the community feed with an Admin badge. Pinned to top. Can be cohort-scoped or app-wide.",
        screenshot: { ...S("admin-announcements"), placeholder: "Announcements composer" },
      },
    ],
  },
  {
    slug: "docs-portal-tour",
    title: "Docs portal: this very page",
    audience: "admin",
    summary: "How to navigate the documentation portal at /admin/docs (you're already here).",
    steps: [
      {
        title: "1. Overview",
        description: "Plain-prose introduction — what LevelUp is, the four pillars, who uses the app, the stack. Read this first if you just landed.",
        screenshot: { ...S("admin-docs-overview"), placeholder: "Overview tab" },
      },
      {
        title: "2. Features catalogue",
        description: "Every capability with a status badge: Shipped / Partial / Planned / Deprecated. Filter by clicking the count cards. Each feature shows code refs + clickable app links.",
        screenshot: { ...S("admin-docs-features"), placeholder: "Features tab" },
      },
      {
        title: "3. Flows (this tab)",
        description: "Step-by-step user journeys with screenshots. Toggle Mobile ↔ Desktop at the top to see both viewports.",
        screenshot: { ...S("admin-docs-flows"), placeholder: "Flows tab" },
      },
      {
        title: "4. Schema",
        description: "30+ public.* tables documented with purpose, key columns, relationships. Collapsible details per table.",
        screenshot: { ...S("admin-docs-schema"), placeholder: "Schema tab" },
      },
      {
        title: "5. Changelog",
        description: "Human-readable change log from the doc_changelog table. Hand-written entries, NOT auto-generated from git. Sortable by date.",
        screenshot: { ...S("admin-docs-changelog"), placeholder: "Changelog tab" },
      },
      {
        title: "6. Download as markdown",
        description: "Button in the top-right of every tab. Concatenates every section into a single .md file you paste into Claude (or any LLM) as a system prompt — instant full context on the codebase.",
        screenshot: { placeholder: "Download button (top-right) — exports the entire docs as a single markdown" },
      },
    ],
  },
];
