/**
 * User flows — every important journey through the app, step-by-step.
 *
 * Each step can have an optional screenshot (desktop + mobile) which
 * the docs portal renders inline with a toggle. The placeholder text
 * shows until real screenshots are captured + dropped into
 * src/docs/screenshots/.
 *
 * Audience is who walks through this flow in real life — sometimes
 * "student" (the public-facing happy path), sometimes "admin" (a
 * back-office workflow).
 */
import type { Flow } from "../types";

export const FLOWS: Flow[] = [
  {
    slug: "student-signup-to-purchase",
    title: "Student: signup → purchase → first watch",
    audience: "student",
    summary: "The full happy path from a Meta ad click all the way to a student watching their first chapter.",
    steps: [
      {
        title: "1. Ad click → landing on /offering/:slug",
        description: "User clicks a Meta/Google/X ad → lands on the public offering page. UTM params captured for attribution. Page shows hero video, what-you'll-learn, curriculum preview, free preview button.",
        screenshot: { placeholder: "Public offering page hero + curriculum module list" },
      },
      {
        title: "2. Free preview play",
        description: "User clicks 'Watch free preview' → the first is_free chapter plays via VdoCipher (anon-allowed). No signup wall yet — friction-free taste of the content.",
        screenshot: { placeholder: "Anon chapter viewer with watermark" },
      },
      {
        title: "3. Buy now → /checkout",
        description: "Hero CTA jumps to /checkout. Guest mode is default so ad traffic doesn't bounce. Email + phone required. Optional coupon. Real-time price update.",
        screenshot: { placeholder: "Checkout page with price breakdown + coupon" },
      },
      {
        title: "4. Razorpay modal",
        description: "Pay button → create-razorpay-order edge function returns order_id → Razorpay modal opens. UPI, card, netbanking, wallets all supported.",
        screenshot: { placeholder: "Razorpay standard checkout modal" },
      },
      {
        title: "5. Capture → /thank-you",
        description: "Webhook captures payment. Enrolment created. User redirected to /thank-you with confetti + 'start learning' CTA. Welcome email queued. Invoice PDF generated.",
        screenshot: { placeholder: "Thank-you confirmation screen" },
      },
      {
        title: "6. First watch",
        description: "Clicking 'Start learning' lands them on /chapter/<first>. Notes panel + Q&A tab + Up Next sidebar. Progress auto-saved.",
        screenshot: { placeholder: "Chapter viewer with notes drawer open" },
      },
    ],
  },
  {
    slug: "admin-create-masterclass",
    title: "Admin: launch a new masterclass",
    audience: "admin",
    summary: "Steps an admin takes from green-field to publishing a new masterclass on the storefront.",
    steps: [
      {
        title: "1. /admin/offerings → New",
        description: "Create the offering: slug, title, subtitle, type='masterclass', product_tier='masterclass', price_inr, hero_image_url. Status starts as 'draft'.",
      },
      {
        title: "2. Curriculum editor",
        description: "/admin/courses/<id>/curriculum — Add chapters one-by-one. For each: title, VdoCipher video ID (upload triggers metadata fetch — duration + thumbnail auto-populated). Drag to reorder.",
      },
      {
        title: "3. Mark free preview chapter(s)",
        description: "Toggle is_free on the first chapter (or any teaser chapter). These show in the anon storefront preview.",
      },
      {
        title: "4. Set hero + marketing copy",
        description: "Edit the offering page content — long description, what-you'll-learn bullets, instructor bio, FAQ. Reorder lesson rail.",
      },
      {
        title: "5. Publish",
        description: "Flip status to 'active'. Offering appears on /browse + becomes purchasable. Test in incognito.",
      },
      {
        title: "6. Run paid ad",
        description: "Marketing kicks off Meta ad with the offering URL + UTM params. UTM is captured in crm_contacts via lead_capture if a form intercepts; otherwise the buyer's referrer is logged on the order.",
      },
    ],
  },
  {
    slug: "cohort-week-lifecycle",
    title: "Cohort: weekly assignment lifecycle",
    audience: "student",
    summary: "What happens between Monday morning (week opens) and Sunday night (week closes).",
    steps: [
      {
        title: "Mon — week opens",
        description: "pg_cron unlocks the week (if locked_until is set). Student dashboard shows new assignment with due_at. Email reminder fires (template: cohort_week_opens).",
      },
      {
        title: "Mon-Sat — work + submit",
        description: "Student fills the submission form (text body, file uploads, optional link, peer-review opt-in). Can edit until mentor opens it.",
      },
      {
        title: "Wed — peer review opens",
        description: "Cohort-mates' opted-in submissions are visible at /community → Peer Reviews. Drawer with critique + 5-star + draft.",
      },
      {
        title: "Sat 9pm — 24h-before-due reminder",
        description: "notify-cohort scans every 15 min. Members who haven't submitted get email + WhatsApp pings.",
      },
      {
        title: "Sun midnight — due",
        description: "Submissions lock. Mentors open /admin/cohort-submissions and start reviewing. Each gets feedback within 48h.",
      },
      {
        title: "Mon-Tue — feedback returns",
        description: "Mentor writes feedback → student sees it in their dashboard with a 'New feedback' badge. Email fires (cohort_submission_reviewed).",
      },
      {
        title: "+24-48h — missed-assignment nudge",
        description: "Members who never submitted get a one-time 'we missed you' email (cohort_assignment_missed). Idempotent — won't double-fire.",
      },
    ],
  },
  {
    slug: "founders-office-bulk-grant",
    title: "Founders Office: bulk grant access via CLI",
    audience: "admin",
    summary: "How a non-engineer on the team uses the levelup CLI to grant 100 users access to an offering — without touching the React admin UI.",
    steps: [
      {
        title: "1. Get an API key from /admin/api",
        description: "Admin issues a key with scope='admin' (needed for enrolments.grant). Plaintext is shown once + copied.",
      },
      {
        title: "2. Install the CLI",
        description: "Run the install-instructions snippet from the per-key dialog: gh repo clone levelupadmin/levelup-cli + npm link + levelup auth set <key>.",
      },
      {
        title: "3. List the user IDs to grant",
        description: "Run `levelup users search --q <email-or-phone>` for each, or pull a CSV of user IDs from a different tool.",
      },
      {
        title: "4. Loop grant",
        description: "Shell loop: `for u in $(cat users.txt); do levelup enrolments grant --user_id $u --offering_id <oid>; done`. Each call is logged in api_call_log.",
      },
      {
        title: "5. Verify in /admin/enrolments",
        description: "The new enrolments show up immediately. Webhooks fire (enrolment.granted) → CRM is updated.",
      },
    ],
  },
  {
    slug: "marketing-lead-flow",
    title: "Marketing: ad → lead → CRM → conversion",
    audience: "marketing",
    summary: "How a Meta ad form-fill turns into a tracked lead in the CRM and ultimately a buyer.",
    steps: [
      {
        title: "1. Meta lead form submit",
        description: "Visitor fills a Meta lead form. Zapier (or n8n) catches the new lead and POSTs to /functions/v1/admin-api with action: leads.create.",
      },
      {
        title: "2. Idempotent capture",
        description: "lead_capture RPC matches by email-then-phone. If new → crm_contacts insert. If existing → merge custom_fields. crm_contact.created webhook fires.",
      },
      {
        title: "3. Outreach + tagging",
        description: "Sales tags the lead with users.tag --user_id ... --tag warm. Notes added via users.add_note.",
      },
      {
        title: "4. Email nurture",
        description: "campaigns.email_send_one fires a transactional sequence. Open + click events tracked. unsubscribe sets unsubscribed_at on user_marketing_prefs.",
      },
      {
        title: "5. Conversion",
        description: "Lead buys → razorpay-webhook → enrolment created → users row created with phone match → legacy_enrolments auto-claim trigger fires. crm_contact.converted webhook fires with the new user_id.",
      },
      {
        title: "6. CRM updated",
        description: "Webhook subscriber (HubSpot/Pipedrive/Notion) receives the converted event with full payload including the new user_id, total_paid_inr, offering details.",
      },
    ],
  },
];
