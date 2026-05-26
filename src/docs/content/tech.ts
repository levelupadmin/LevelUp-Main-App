/**
 * Technical architecture — for a dev who needs to set up the project,
 * find the right file to edit, or understand a piece of the system.
 *
 * Plain prose. No magic. Code paths included so a grep gets you home.
 */

export const TECH_SECTIONS: Array<{
  id: string;
  title: string;
  body: string;
}> = [
  {
    id: "monorepo-layout",
    title: "Repository layout",
    body: `**LevelUp-Main-App** (this repo) is the React + Supabase LMS. It's a
single Vite app, no monorepo. Lives at \`github.com/levelupadmin/LevelUp-Main-App\`.

Two sibling repos that depend on this one's API:

- \`levelupadmin/levelup-cli\` — the Node CLI. Zero deps beyond Node ≥ 18.
- \`levelupadmin/levelup-mcp\` — the MCP server. Zero deps.

Both are tiny (one binary each) — they ONLY talk to the \`admin-api\`
edge function. No main-app code inside either.

**Folders inside this repo:**

- \`src/\` — React app
  - \`pages/\` — top-level routes (each is a route's entry component)
  - \`pages/admin/\` — admin-only pages (mounted under AdminLayout)
  - \`components/\` — feature components grouped by domain (auth/, checkout/, cohort/, ...)
  - \`components/ui/\` — shadcn primitives (Button, Card, Dialog, ...)
  - \`hooks/\` — custom React hooks
  - \`lib/\` — utilities, permissions, analytics client
  - \`integrations/supabase/\` — the supabase client + generated types
  - \`docs/\` — THIS documentation portal's content
- \`supabase/\` — backend
  - \`migrations/\` — SQL migrations, named with ISO timestamps
  - \`functions/\` — Deno edge functions
- \`scripts/\` — one-shot Python migration + backfill scripts
- \`public/\` — static assets served by Vite`,
  },
  {
    id: "frontend",
    title: "Frontend stack",
    body: `**React 18 + TypeScript + Vite + Tailwind**. Concrete versions are in
\`package.json\`.

**Routing**: React Router v6. The router tree is in \`src/App.tsx\`.
Admin routes are wrapped by \`AdminLayout\` (with auth guards in
\`canAccessRoute\`). All admin pages are lazy-loaded via \`React.lazy()\`
to keep the initial bundle small.

**State**:
- **Server state**: TanStack Query (React Query) for cached fetches.
- **Auth state**: AuthContext provider (\`src/contexts/AuthContext.tsx\`).
- **Local UI state**: \`useState\` — no Redux, no Zustand.

**Styling**: Tailwind CSS with the custom design tokens declared as CSS
variables in \`src/index.css\` (e.g. \`--accent-amber\`, \`--cream\`).
shadcn/ui primitives for unstyled-but-accessible components. Class
merging via \`clsx\` + \`tailwind-merge\` exposed through \`cn()\`.

**Forms**: \`react-hook-form\` + zod schemas (in places where validation
is non-trivial). Simpler forms use plain refs / \`useState\`.

**Icons**: \`lucide-react\`. One library, consistent line weight.

**Player**: VdoCipher provides its own embed; we drive the OTP exchange
+ playback policy from \`get-vdocipher-otp\` edge function.`,
  },
  {
    id: "backend",
    title: "Backend stack (Supabase)",
    body: `**Postgres 15** (managed by Supabase, region: ap-northeast-1 Tokyo).

**Schemas**:
- \`public\` — every app table. ~70 tables.
- \`auth\` — Supabase Auth tables. Never edit directly.
- \`storage\` — Supabase Storage internal tables.
- \`extensions\` — \`pgcrypto\`, \`pg_net\`, \`pg_cron\`, \`vault\`, others.

**Edge functions** live in \`supabase/functions/<name>/index.ts\`. Each
is a self-contained Deno script with its own dependencies (typically
just \`@supabase/supabase-js\` from esm.sh). 25+ functions deployed.
List them with \`supabase functions list --project-ref ...\`.

**Migrations**: Forward-only. Named with ISO timestamp prefix. Apply
via \`supabase db push --linked\`. Each migration must be idempotent
where possible (\`CREATE TABLE IF NOT EXISTS\`, \`ADD COLUMN IF NOT
EXISTS\`).

**RLS**: Every \`public.\` table has RLS enabled. Policies are colocated
with the table's creation migration. The standard pattern:

\`\`\`sql
CREATE POLICY ${"\""}<table>_admin_all${"\""} ON public.<table>
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY ${"\""}<table>_self_read${"\""} ON public.<table> FOR SELECT
  USING (user_id = auth.uid());
\`\`\`

**Cron**: \`pg_cron\` runs in-DB. See \`supabase/migrations/...notify_cohort_cron.sql\` for the canonical example — runs every 15 min, calls an edge function via \`net.http_post\` with the service-role JWT pulled from \`vault.decrypted_secrets\`.`,
  },
  {
    id: "deployment",
    title: "Deployment + CI",
    body: `**Frontend**: deployed to **Vercel**. Connected to \`main\` branch of the
GitHub repo. Each push triggers a build + deploy. Production URL:
\`app.leveluplearning.in\`. Preview URLs per PR.

⚠️ **Git author gotcha**: Vercel rejects deploys when the auto-generated
\`user@host.local\` git author email is used. Always verify
\`git config user.email\` is a real address (e.g. \`ceo@leveluplearning.in\`)
before committing.

**Backend**: Supabase manages Postgres + Auth + Storage. Edge functions
are deployed via \`supabase functions deploy <name> --project-ref ivkvluezuiojovpotlyb --no-verify-jwt\`
(the \`--no-verify-jwt\` is critical for endpoints that accept anon /
service-role / custom auth).

**Migrations**: deployed via \`supabase db push --linked\` from a
developer's machine after committing the migration file. We do NOT
yet have a CI step to auto-apply.

**Domain + DNS**: \`leveluplearning.in\` (marketing site, separate Astro
repo \`levelupnewsite\`) and \`app.leveluplearning.in\` (this LMS).
\`.well-known/assetlinks.json\` is mirrored across both domains for
Android Digital Asset Links.

**Mobile**: Capacitor builds. iOS via Xcode → TestFlight → App Store
Connect. Android via \`./gradlew bundleRelease\` → AAB → Play Console.`,
  },
  {
    id: "integrations",
    title: "Third-party integrations",
    body: `**Razorpay** — payments. Standard Checkout + webhook. Test mode toggle
in \`payment_orders.is_test\`. Webhook secret in Supabase secrets.

**VdoCipher** — DRM video streaming. OTP exchange via
\`get-vdocipher-otp\`. Upload credentials via \`vdocipher-upload-credential\`.
Video metadata (duration, thumbnail) fetched via \`get-vdocipher-video-meta\`.

**Brevo** (formerly Sendinblue) — transactional email. The
\`queue-transactional-email\` function processes the \`email_queue\` table
every cron tick.

**Interakt** — WhatsApp Business API. Used for cohort reminders.
\`INTERAKT_API_KEY\` in Supabase secrets.

**MSG91** — phone OTP delivery. \`send-otp\` + \`verify-otp\` functions.

**OpenAI** — image generation for hero/cinematic stills.
**Always use gpt-image-2** (not gpt-image-1, which is deprecated).

**Sentry** — error tracking. DSN in env. Auto-instruments React + edge functions.

**Meta + GA4 + Clarity + Twitter Pixel** — client-side analytics. IDs
stored in \`analytics_settings\` table, loaded by \`src/lib/analytics.ts\`.

**Higgsfield** (Soul / Mix / DoP / ID models), **Seedance 1.0 Pro**,
**Sora 2**, **Veo 3** — used by the levelup-creative-batch skill for
ad creatives. Not part of this app's runtime.`,
  },
  {
    id: "secrets",
    title: "Secrets management",
    body: `Local development uses a \`.env.local\` file (never committed). Production
secrets live in **Supabase Project Settings → Edge Functions Secrets**
and **Vercel Project → Environment Variables**.

**Critical secrets** (do not commit, do not paste in chat):
- \`SUPABASE_SERVICE_ROLE_KEY\` — full DB access.
- \`RAZORPAY_KEY_SECRET\` / \`RAZORPAY_WEBHOOK_SECRET\` — payment signing.
- \`VDOCIPHER_API_SECRET\` — DRM OTP signing.
- \`BREVO_API_KEY\` — email send.
- \`INTERAKT_API_KEY\` — WhatsApp send.
- \`MSG91_AUTH_KEY\` — OTP send.
- \`OPENAI_API_KEY\` — image generation.

The DB password + Management API PAT live in
\`~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/.env.supabase\`.

Team API keys (the \`lvlup_…\` keys used by the CLI/MCP/HTTP) are
bcrypt-hashed in \`team_api_keys\` table. Issue + revoke from
\`/admin/api → Keys\`.`,
  },
];
