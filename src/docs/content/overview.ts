/**
 * The Overview tab: what LevelUp is, why it exists, and where to start
 * reading. Plain prose, written for a smart non-dev who just joined the
 * Founders Office and needs the big picture in 5 minutes.
 */

export const OVERVIEW_SECTIONS: Array<{
  id: string;
  title: string;
  body: string;
}> = [
  {
    id: "what",
    title: "What is the LevelUp Main App?",
    body: `LevelUp Learning is India's creative education business. The "main app" (this
codebase) is the **learning management system + commerce platform** that
runs everything our students touch: signup, course browsing, checkout,
watching, the live cohort experience, the community, certificates, and the
admin tools that the team uses to run all of the above.

It replaces our previous platform (TagMango) end-to-end. Same students,
same content, same business, but now we own the data, the UX, the
checkout, and the infrastructure.`,
  },
  {
    id: "pillars",
    title: "The four pillars",
    body: `LevelUp sells four kinds of things:

1. **Masterclasses**: pre-recorded courses with a famous filmmaker
   (Karthick Subbaraj, G Venket Ram, Anthony Gonsalvez, Ravi Basrur, DRK
   Kiran, etc.). One-time payment, lifetime access.

2. **Live cohorts**: multi-week structured programs (BFP, Forge, ADP)
   with weekly assignments, peer review, attendance, mentor feedback,
   live sessions. Higher ticket, higher touch.

3. **Workshops**: short 1-3 day intensives. Single payment, time-bound
   content access.

4. **Resources**: supplementary content (scripts, templates, talks)
   bundled into the platform.

Every offering on the app has a \`product_tier\` field that maps to one
of these four. Marketing copy, pricing, the cohort dashboard, the
community scope filter, and the analytics all key off this distinction.`,
  },
  {
    id: "who",
    title: "Who uses this app",
    body: `**Students** sign up via phone OTP, browse offerings, buy via
Razorpay, watch chapters on VdoCipher, participate in cohorts, post in
community. They see only the public + their entitled content.

**Admins / instructors** manage offerings, create cohort weeks, review
assignment submissions, mark attendance, send announcements, issue
refunds, pull revenue reports. They access \`/admin\`.

**Founders Office / Marketing / Sales teams** use the admin API
(\`/admin/api\`) via CLI, MCP, or HTTP to drive bulk operations, sync
with their CRM, capture leads, automate workflows.

**AI agents** (Claude Desktop, Claude Code, Cursor) can drive the
admin API through MCP to execute work autonomously.`,
  },
  {
    id: "stack",
    title: "Stack at a glance",
    body: `**Frontend**: React 18 + TypeScript + Vite + Tailwind. Lazy-loaded
admin pages. React Router v6. Tanstack Query.

**Backend**: Supabase (Postgres + Auth + Storage + Edge Functions +
pg_cron + pg_net). Edge functions in Deno/TypeScript. Roughly 70 tables
under \`public.\` schema.

**Payments**: Razorpay (test + prod). Webhook → DB → entitlement.

**Video**: VdoCipher for DRM-protected streaming. Supabase Storage for
plain MP4/HLS fallback (workshop-archive bucket).

**Email**: Brevo via \`queue-transactional-email\` edge function. Templates
in \`email_templates\` table. Bulk sends via \`send-bulk-email\`.

**WhatsApp**: Interakt API for cohort reminders + transactional pings.

**Analytics**: Meta Pixel, GA4, Microsoft Clarity, Twitter Pixel,
configurable per-environment from \`/admin/analytics-settings\`. Server-side
Meta CAPI with event-ID dedup.

**Mobile**: Capacitor shell for iOS + Android. Same React app, native
WebView. Reader Rule compliant (payments stay on the web).

**AI surface**: \`admin-api\` edge function exposes 74 actions; the
CLI (\`levelupadmin/levelup-cli\`) and MCP (\`levelupadmin/levelup-mcp\`)
are separate repos that wrap it.`,
  },
  {
    id: "where",
    title: "Where to read next",
    body: `**Just landed?** Start with the **Features** tab to see what's built and
what's not. Each feature has a status badge: "shipped" means it's live
on production; "partial" means a UI exists but it's not fully wired;
"planned" means we've discussed it but haven't built it; "deprecated"
means it exists but should be ignored.

**Editing the database?** Go to **Schema** tab, where every table is
documented with its purpose and key columns.

**Building an integration?** **API** tab has the full admin-api surface,
all 74 actions, plus CLI + MCP install instructions.

**Want to know what changed recently?** **Changelog** tab. Sorted by
date. Written for humans.

**Need to brief Claude on the codebase?** Click **Download as markdown**
in the top-right of any tab. You'll get a single \`.md\` file with every
tab's content concatenated. Paste it as a system prompt and your AI
assistant will know the whole app.`,
  },
];
