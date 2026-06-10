/**
 * Database schema reference, every public table that a teammate is
 * likely to read, query, or edit. Internal plumbing tables
 * (audit_logs, attempt counters, queue rows) are referenced briefly
 * but not exhaustively documented here.
 *
 * Source of truth is the migrations themselves. This file translates
 * them into prose.
 */
import type { SchemaTable } from "../types";

export const SCHEMA_TABLES: SchemaTable[] = [
  /* ─────────── people ─────────── */
  {
    name: "users",
    purpose: "App users. Created on first phone-OTP verify or admin grant. Linked 1:1 with auth.users.",
    surfacedInAdmin: true,
    rowCountRange: "100s today, scaling to 10K+",
    keyColumns: [
      { name: "id", type: "uuid", description: "PK, matches auth.users.id" },
      { name: "email", type: "text", description: "Nullable. Lowercased convention." },
      { name: "phone", type: "text", description: "+91XXXXXXXXXX format preferred (some legacy rows 10-digit)." },
      { name: "full_name", type: "text", description: "User-edited display name." },
      { name: "role", type: "text", description: "owner|admin|instructor|author|support|student. Guarded by trigger." },
      { name: "is_legacy", type: "boolean", description: "True if migrated from TagMango. Used for filtering in /admin/users." },
      { name: "city / state / country", type: "text", description: "Geo segmentation. country defaults 'India'." },
      { name: "program_vertical", type: "text", description: "Forge|Live|Masterclass|Workshop|Multi. From Customer Brain v3 backfill." },
      { name: "lifetime_revenue_inr", type: "integer", description: "Auto-maintained by trigger on payment_orders insert/capture." },
      { name: "first_purchase_at / last_purchase_at", type: "timestamptz", description: "Same trigger." },
      { name: "purchase_count", type: "integer", description: "Same trigger." },
    ],
    relationships: [
      "enrolments.user_id → users.id (cascade delete)",
      "payment_orders.user_id → users.id (restrict)",
      "user_tags.user_id, user_notes.user_id, user_marketing_prefs.user_id (all cascade)",
    ],
  },
  {
    name: "user_marketing_prefs",
    purpose: "Per-user opt-in flags + UTM provenance + CRM linkage. One row per user.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "user_id", type: "uuid", description: "PK + FK." },
      { name: "email_opt_in / whatsapp_opt_in / sms_opt_in", type: "boolean", description: "Honored by bulk send + cohort notify." },
      { name: "source", type: "text", description: "Lead source (e.g. 'instagram_ad')." },
      { name: "utm_source / utm_medium / utm_campaign / utm_term / utm_content", type: "text", description: "Attribution." },
      { name: "crm_id", type: "text", description: "External CRM contact ID (e.g. HubSpot)." },
      { name: "consent_at / unsubscribed_at", type: "timestamptz", description: "GDPR-style consent tracking." },
    ],
  },
  {
    name: "user_tags",
    purpose: "Per-user tags for segmentation. UNIQUE on (user_id, tag) so re-tagging upserts.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "user_id + tag", type: "uuid + text", description: "Composite unique." },
      { name: "value", type: "text", description: "Optional payload (e.g. tag='warm', value='Q4-2025')." },
      { name: "source", type: "text", description: "'admin_ui'|'api'|'auto'." },
    ],
  },
  {
    name: "user_notes",
    purpose: "Free-form internal notes per user, written by admins/CS. Audit trail.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "user_id", type: "uuid", description: "Target." },
      { name: "body", type: "text", description: "1-4000 chars." },
      { name: "created_by", type: "uuid", description: "FK users.id of the admin who wrote it." },
    ],
  },
  {
    name: "crm_contacts",
    purpose: "Pre-purchase leads. Captured from ad forms / marketing site / API. Converts to a users row on signup.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "email + phone", type: "text + text", description: "At least one required (CHECK)." },
      { name: "status", type: "text", description: "new|contacted|qualified|converted|lost|spam." },
      { name: "owner_user_id", type: "uuid", description: "Internal sales/CSM owner." },
      { name: "utm_*", type: "text", description: "Attribution fields." },
      { name: "mql_tier / mql_score", type: "text / integer", description: "Lead quality from Customer Brain v3." },
      { name: "lifecycle_stage", type: "text", description: "Lead|Applied|Converted - Fully Paid|..." },
      { name: "converted_user_id / converted_at", type: "uuid / timestamptz", description: "Set when the lead becomes a user." },
      { name: "tags", type: "text[]", description: "Per-contact tags array." },
      { name: "custom_fields", type: "jsonb", description: "Free-form. Merged on idempotent re-capture." },
    ],
  },

  /* ─────────── content ─────────── */
  {
    name: "offerings",
    purpose: "The 'thing you can buy'. A masterclass, cohort, workshop, or bundle.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "slug", type: "text", description: "URL-safe identifier, e.g. 'karthick-subbaraj-teaches-filmmaking'." },
      { name: "type", type: "text", description: "masterclass|cohort|workshop|bundle|other." },
      { name: "product_tier", type: "text", description: "masterclass|live_cohort|advanced_program|workshop|other. Used for grouping in UI + revenue rollup." },
      { name: "price_inr / mrp_inr", type: "integer", description: "MRP is the strikethrough; price is what's charged." },
      { name: "payment_mode", type: "text", description: "one_time|cohort|subscription." },
      { name: "status", type: "text", description: "draft|active|archived." },
      { name: "is_public", type: "boolean", description: "Whether it shows on /browse + storefront." },
    ],
  },
  {
    name: "courses",
    purpose: "1:1 with offerings. The chapter container.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "offering_id", type: "uuid", description: "FK." },
      { name: "title / subtitle", type: "text", description: "Display." },
    ],
  },
  {
    name: "chapters",
    purpose: "The atomic unit students consume. Video, PDF, article, quiz.",
    surfacedInAdmin: true,
    rowCountRange: "350+ today",
    keyColumns: [
      { name: "course_id", type: "uuid", description: "FK." },
      { name: "section_id", type: "uuid", description: "Optional grouping." },
      { name: "sort_order", type: "integer", description: "Position within course." },
      { name: "content_type", type: "text", description: "video|pdf|article|quiz|assignment." },
      { name: "media_provider", type: "text", description: "vdocipher|supabase|webinarkit|external|tagmango." },
      { name: "video_url", type: "text", description: "Direct URL (HLS or MP4)." },
      { name: "vdocipher_video_id", type: "text", description: "When media_provider=vdocipher." },
      { name: "vdocipher_thumbnail_url", type: "text", description: "Auto-fetched on save." },
      { name: "duration_seconds", type: "integer", description: "Auto-fetched on save (vdocipher only)." },
      { name: "is_free", type: "boolean", description: "Anon-playable preview." },
    ],
  },
  {
    name: "chapter_notes",
    purpose: "Per-user, per-chapter free-form notes. Synced across devices.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "user_id + chapter_id", type: "uuid + uuid", description: "Composite PK." },
      { name: "body_md", type: "text", description: "Markdown-style. Auto-saved on chapter change/unmount." },
    ],
  },
  {
    name: "chapter_qna",
    purpose: "Per-chapter Q&A thread.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "chapter_id, user_id", type: "uuid", description: "Author + chapter." },
      { name: "kind", type: "text", description: "question|answer|comment." },
      { name: "parent_id", type: "uuid", description: "Threading." },
    ],
  },

  /* ─────────── commerce ─────────── */
  {
    name: "payment_orders",
    purpose: "Razorpay order records. One per checkout attempt. The webhook flips status to 'captured' or 'failed'.",
    surfacedInAdmin: true,
    rowCountRange: "10s daily; 1K+ lifetime",
    keyColumns: [
      { name: "user_id", type: "uuid", description: "FK." },
      { name: "offering_id", type: "uuid", description: "FK." },
      { name: "subtotal_inr / discount_inr / gst_inr / total_inr", type: "numeric", description: "Money fields, ₹." },
      { name: "razorpay_order_id / razorpay_payment_id / razorpay_signature", type: "text", description: "Razorpay identifiers." },
      { name: "status", type: "text", description: "created|authorized|captured|failed|refunded." },
      { name: "captured_at / refunded_at", type: "timestamptz", description: "State transition timestamps." },
      { name: "payment_method", type: "text", description: "card|upi|netbanking|wallet|paylater. Backfilled from Razorpay extracts." },
      { name: "card_last4 / card_network / bank / wallet / vpa", type: "text", description: "Receipt detail." },
      { name: "fee_inr / tax_inr", type: "integer", description: "Razorpay processing fee + GST on the fee." },
      { name: "coupon_code", type: "text", description: "Denormalized; for fast attribution rollups." },
      { name: "notes", type: "jsonb", description: "Razorpay 'notes' object + our custom keys." },
    ],
  },
  {
    name: "enrolments",
    purpose: "User → offering entitlement. Created by webhook (purchase), admin grant, or legacy claim trigger.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "user_id", type: "uuid", description: "FK." },
      { name: "offering_id", type: "uuid", description: "FK." },
      { name: "payment_order_id", type: "uuid", description: "NULL for admin grants + legacy claims." },
      { name: "status", type: "text", description: "active|expired|revoked|cancelled. Unique partial index on (user_id, offering_id) WHERE status='active'." },
      { name: "starts_at / expires_at", type: "timestamptz", description: "For time-bound access (workshops)." },
      { name: "source", type: "text", description: "checkout|admin_grant|legacy_claim." },
      { name: "edition_label", type: "text", description: "e.g. 'Edition 9 Jaipur' for cohort batches." },
      { name: "total_paid_inr", type: "integer", description: "Denormalized from payment_orders.total_inr." },
    ],
  },
  {
    name: "coupons",
    purpose: "Discount codes. Validated client-side + server-side at checkout.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "code", type: "text", description: "UNIQUE." },
      { name: "discount_type", type: "text", description: "percent|flat." },
      { name: "discount_value", type: "numeric", description: "% or ₹ amount." },
      { name: "max_redemptions / used_count", type: "integer", description: "Usage cap." },
      { name: "valid_from / valid_until", type: "timestamptz", description: "Time bounds." },
      { name: "applies_to_offering_id", type: "uuid", description: "NULL = applies to all." },
    ],
  },
  {
    name: "legacy_enrolments",
    purpose: "Pre-claim TagMango entitlements. Created from CSV ingest. Auto-converts to enrolments when matching user signs in.",
    surfacedInAdmin: true,
    rowCountRange: "1070+",
    keyColumns: [
      { name: "phone", type: "text", description: "Primary match key. Normalized to +91 format." },
      { name: "email", type: "text", description: "Secondary match key." },
      { name: "offering_id", type: "uuid", description: "Mapped via legacy_program_mapping. NULL until admin maps the program." },
      { name: "legacy_program_name", type: "text", description: "The CSV's raw program string. Joined with mapping table." },
      { name: "claimed_by_user_id / claimed_at", type: "uuid / timestamptz", description: "Set by trigger when user signs in." },
      { name: "source", type: "text", description: "'tagmango' default." },
    ],
  },
  {
    name: "legacy_program_mapping",
    purpose: "TagMango program name → offering_id mapping. Admin-curated in /admin/legacy-mappings.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "source + legacy_program_name", type: "text + text", description: "UNIQUE." },
      { name: "offering_id", type: "uuid", description: "Target. NULL when decision=skipped." },
      { name: "decision_status", type: "text", description: "pending|mapped|skipped." },
    ],
  },

  /* ─────────── cohort ─────────── */
  {
    name: "cohort_batches",
    purpose: "A specific cohort run (e.g. BFP Edition 9 Jaipur). Linked to one offering.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "offering_id", type: "uuid", description: "FK." },
      { name: "label", type: "text", description: "Display name." },
      { name: "starts_at / ends_at", type: "timestamptz", description: "Window." },
    ],
  },
  {
    name: "cohort_weeks",
    purpose: "Per-batch week definition. Week number, theme, assignment, due date.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "cohort_batch_id", type: "uuid", description: "FK." },
      { name: "week_number", type: "integer", description: "1, 2, 3..." },
      { name: "theme", type: "text", description: "Week's topic." },
      { name: "assignment_prompt_md", type: "text", description: "Markdown body shown to students." },
      { name: "assignment_due_at", type: "timestamptz", description: "Submission deadline." },
      { name: "session_at", type: "timestamptz", description: "Live session time." },
      { name: "locked_until", type: "timestamptz", description: "Hide from students until this passes." },
    ],
  },
  {
    name: "cohort_week_submissions",
    purpose: "A student's submitted work for a week's assignment.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "user_id + cohort_week_id", type: "uuid + uuid", description: "Unique." },
      { name: "text_content", type: "text", description: "Body of the submission." },
      { name: "file_urls", type: "text[]", description: "Supabase Storage paths." },
      { name: "link_url", type: "text", description: "External URL (video, doc, etc.)." },
      { name: "status", type: "text", description: "submitted|reviewed|revised." },
      { name: "open_to_peer_review", type: "boolean", description: "Opt-in for the community board." },
      { name: "submitted_at / reviewed_at", type: "timestamptz", description: "State transitions." },
    ],
  },
  {
    name: "peer_review_assignments",
    purpose: "One review (or draft thereof) by one cohort-mate on one submission.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "submission_id + reviewer_user_id", type: "uuid + uuid", description: "Unique." },
      { name: "feedback_text", type: "text", description: "The critique body." },
      { name: "rating", type: "integer", description: "1-5." },
      { name: "status", type: "text", description: "pending|in_progress|submitted|skipped." },
    ],
  },
  {
    name: "cohort_attendance",
    purpose: "Per-session attendance marker.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "user_id + session_id (live_sessions.id)", type: "uuid + uuid", description: "Unique." },
      { name: "status", type: "text", description: "present|absent|excused." },
    ],
  },
  {
    name: "cohort_notifications_log",
    purpose: "Idempotency log for cohort reminders. (template_key, user_id, related_kind, related_id) is UNIQUE so re-runs never double-fire.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "template_key", type: "text", description: "cohort_assignment_due_24h, cohort_session_reminder_1h, cohort_submission_reviewed, cohort_assignment_missed." },
      { name: "user_id, related_kind, related_id", type: "uuid + text + uuid", description: "What was notified about." },
    ],
  },

  /* ─────────── community ─────────── */
  {
    name: "community_posts",
    purpose: "Twitter-like post feed. Either app-wide or cohort-scoped via cohort_batch_id.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "user_id", type: "uuid", description: "Author." },
      { name: "content_text", type: "text", description: "Body." },
      { name: "cohort_batch_id", type: "uuid", description: "NULL = app-wide." },
      { name: "is_pinned / is_admin_post", type: "boolean", description: "Display modifiers." },
      { name: "post_type", type: "text", description: "normal|announcement|peer_review." },
    ],
  },
  {
    name: "community_post_comments",
    purpose: "Threaded comments on community_posts.",
    surfacedInAdmin: false,
    keyColumns: [
      { name: "post_id, user_id, comment_text", type: "uuid + uuid + text", description: "-" },
    ],
  },
  {
    name: "community_post_likes",
    purpose: "❤️ likes. UNIQUE on (post_id, user_id).",
    surfacedInAdmin: false,
    keyColumns: [],
  },

  /* ─────────── messaging ─────────── */
  {
    name: "email_templates",
    purpose: "Brevo transactional templates. Key + subject + html_body + interpolation variables.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "key", type: "text", description: "UNIQUE slug. Referenced by edge functions." },
      { name: "subject / html_body", type: "text", description: "Mustache-style {{var}}." },
      { name: "is_active", type: "boolean", description: "Stops sending if false." },
    ],
  },
  {
    name: "email_queue",
    purpose: "Pending transactional emails. Processed by queue-transactional-email via cron.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "template_key", type: "text", description: "FK email_templates.key." },
      { name: "to_email / to_name", type: "text", description: "Recipient." },
      { name: "merge_vars", type: "jsonb", description: "Substitutions." },
      { name: "status", type: "text", description: "pending|sent|failed." },
      { name: "priority", type: "integer", description: "Lower = sooner." },
    ],
  },

  /* ─────────── API surface ─────────── */
  {
    name: "team_api_keys",
    purpose: "Bcrypt-hashed API keys for the admin-api edge function. Issued + revoked from /admin/api.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "hashed_key", type: "text", description: "Bcrypt of plaintext. Used by verify_team_api_key RPC." },
      { name: "key_hint", type: "text", description: "Last 4 chars of plaintext for identification." },
      { name: "scope", type: "text", description: "read|write|admin." },
      { name: "created_by", type: "uuid", description: "FK users.id." },
      { name: "last_used_at / last_used_ip", type: "timestamptz / inet", description: "Audit." },
      { name: "revoked_at / expires_at", type: "timestamptz", description: "Lifecycle." },
    ],
  },
  {
    name: "api_call_log",
    purpose: "Every admin-api call. Audit + rate-limit support.",
    surfacedInAdmin: true,
    rowCountRange: "Cleaned periodically",
    keyColumns: [
      { name: "api_key_id", type: "uuid", description: "FK team_api_keys." },
      { name: "action", type: "text", description: "e.g. 'offerings.list'." },
      { name: "status_code, duration_ms", type: "smallint, integer", description: "Outcome." },
      { name: "ip, user_agent, request_body, response_summary, error_message", type: "various", description: "Forensic." },
    ],
  },
  {
    name: "webhook_subscriptions",
    purpose: "External systems subscribing to LevelUp events. Pushed to via webhook_deliveries.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "url", type: "text", description: "HTTPS endpoint." },
      { name: "secret", type: "text", description: "HMAC signing secret." },
      { name: "event_types", type: "text[]", description: "Subscribed events. '*' for all." },
      { name: "active", type: "boolean", description: "Toggle without deleting." },
    ],
  },
  {
    name: "webhook_deliveries",
    purpose: "Durable per-delivery log. Retry counters, response excerpt, dead-letter status.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "subscription_id", type: "uuid", description: "FK." },
      { name: "event_type, payload", type: "text, jsonb", description: "What we sent." },
      { name: "status", type: "text", description: "pending|delivered|failed|dead." },
      { name: "attempts, next_retry_at", type: "integer, timestamptz", description: "Retry state." },
      { name: "http_status, response_excerpt", type: "integer, text", description: "Outcome." },
    ],
  },

  /* ─────────── docs ─────────── */
  {
    name: "doc_changelog",
    purpose: "Human-readable changelog entries surfaced in /admin/docs → Changelog. Hand-written, NOT auto-generated.",
    surfacedInAdmin: true,
    keyColumns: [
      { name: "title", type: "text", description: "Headline." },
      { name: "summary", type: "text", description: "1-2 sentence non-dev explanation." },
      { name: "area", type: "text", description: "Auth|Storefront|Cohort|... (matches docs features.area)." },
      { name: "status", type: "text", description: "shipped|partial|planned|deprecated." },
      { name: "shipped_at", type: "timestamptz", description: "When it went live." },
      { name: "body_md", type: "text", description: "Optional long-form context." },
      { name: "user_facing", type: "boolean", description: "True if students notice; false for internal plumbing." },
    ],
  },
];
