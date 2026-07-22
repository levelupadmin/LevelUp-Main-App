# GrowthX (growthx.club) — Community / Events UX Teardown

**Purpose:** Inspiration study for LevelUp cohort rooms. Rahul flagged GrowthX's community/events UX as "extra premium." This maps their patterns onto our documented cohort-room surfaces and the G1–G5 gaps in `COHORT-LOGIC.md`.

**Researched:** 2026-07-16 · Read-only. No posting, RSVP, registration, or credential entry.
**Access level reached:** PUBLIC / logged-out only. See §6 for what sat behind the wall.

---

## 0. Method & capture note (read this first)

Rahul's real Chrome (the `claude-in-chrome` MCP) was **not connected to the account** this session — `list_connected_browsers` returned empty — so there was no live GrowthX session to inherit. I fell back to the sandboxed Browser pane and captured the **public marketing surfaces only**, which is the mission's stated login-wall fallback.

Two tooling limits shaped the capture:
- **No GIFs.** `gif_creator` lives only in the (disconnected) `claude-in-chrome` MCP. Motion is therefore described structurally from DOM/CSS inspection and multi-frame screenshots, not recorded as clips.
- **Homepage resists static capture.** The landing page is a Next.js scroll-scored experience: sections mount/animate only during natural wheel scroll (opacity + transform driven by scroll progress). Instant scroll jumps render black, and the pane's wheel-scroll action times out against the always-running hero animation. I extracted the **full homepage copy and design tokens via the DOM instead** (authoritative), and captured the sub-routes (`/events`, `/events/[slug]`, `/pricing`, `/learn`, `/login`) as normal screenshots since those paint on load.

**Captured media in this folder:**
- `growthx-homepage-og.png` — homepage social card (the glowing-figure hero art)
- `growthx-event-poster-agents.png` — a real event poster (marble hand over an app-icon grid)
- `growthx-event-og-composed.webp` — GrowthX's server-composed event OG card (shows their event-card template)

**What GrowthX actually is now (important):** they have pivoted from a growth/PM community into an **"AI immersion program"** — a *4-day cohort* ("go from using AI to building with it, ship a real product by Sunday") wrapped in a *1-year membership* (weekly expert sessions, city events, private community, credits). This is structurally the same shape as a LevelUp cohort + surrounding membership, which is why the mapping is unusually tight.

---

## 1. Information architecture

A single **persistent left icon-rail** is the whole app shell — it never leaves, on marketing pages and app pages alike. Rail items (each an outline icon + label):

`Home · Events · Learn · Perks · Pricing · FAQs` — and pinned to the bottom: a **context-dependent primary CTA** + `Member login`.

The bottom CTA is the tell: on the home/pricing pages it reads **"Become a member"**; on `/events` and `/learn` it swaps to **"Check Eligibility"** (outlined). Same slot, different word depending on how deep/qualified you are — an application-gating cue baked into the nav.

### Route map (verified)
| Surface | Route | Role |
|---|---|---|
| Home | `/` | The pitch: program + membership, one long scroll |
| Events | `/events` | Discovery: search, city rail, filter chips, upcoming/past grid |
| Event | `/events/{slug}` | **The session "moment"** — the richest page (see §3) |
| Events by city | `/events/city/{city}` | City-scoped listing |
| Learn | `/learn` | Content library: hero + category tabs + course cards |
| Learn item | `/learn/resources|programs|foundations/{slug}` | Individual lessons/programs |
| Perks | `/privileges` | Credits & brand deals |
| Pricing | `/pricing` | Fee, countdown, full inclusions, testimonials |
| FAQs | `/faqs` | — |
| Login wall | `/login?redirect=…` | "Access the club" + "Apply for membership" |

**How the surfaces relate:** Membership is the spine. Everything else is an *inclusion of* membership rendered as its own browsable surface — Events, Learn, the community/directory, and Perks are each both a marketing proof-point (logged-out) and a members-only product (logged-in). The 4-day program is the acquisition wedge; the year membership is the retention product. The IA never makes you choose a "plan" — there is exactly one membership; the only decision staged is *now (early bird) vs later (standard)*.

**Stack observations:** marketing pages are a bespoke Next.js build (Tailwind tokens — grays resolve to `neutral-400`); the **event/app surfaces are Material UI** (`MuiBox-root`, inner scroll container). So the logged-in "app" and the logged-out "marketing" are built differently — worth knowing if we benchmark their in-room polish later (that needs login, §6).

---

## 2. The premium signals (with real examples)

### Typography — a deliberate three-font system
- **Instrument Serif** (a free Google high-contrast editorial serif) for display. Hero is `130px`, weight `400`, letter-spacing `-5.2px`, line-height `125px` (leading *tighter* than the cap height → the dense stacked-headline look). Frequently used *italic* for a single lead word — "***The*** AI immersion program", "Membership fee & inclusions", "*Access the club.*"
- **Gilroy** (geometric sans, Bold/SemiBold/Medium) for body, UI, and bold display when they want weight instead of elegance (event titles are Gilroy-Bold, not the serif).
- **DM Mono** for micro-labels — `10px`, letter-spacing `1.6px`, color `#A3A3A3`: `HOSTED BY`, `LEVEL 1`, `CITY`, `PRICE`, breadcrumbs. The mono label is doing most of the "premium/technical" work.

The pairing rule: *serif for the emotional line, mono for the technical label, sans for everything functional.* Cheap to copy, reads expensive.

### Color
- Base near-black `#060606`, text pure white, muted label gray `#A3A3A3`.
- One electric accent: **`#0064FF`** (buttons, the "X" in the logo, active states).
- **Palette flips as an emotional device:** the dark site turns **warm cream** on `/pricing` (the commitment moment) and **blue-gradient** on `/learn`'s hero. Accent flourishes: **violet/purple** for urgency ("FILLING FAST" badge, the "Grab your spot before it's gone!" banner) and a **gold gradient** on the early-bird price band.
- Imagery is where the color lives: every hero is an art-directed render (glowing orange figure on a starry twilight gradient; a marble hand over a grid of app logos; a desk "diorama" on a moss island; grayscale member photos). Consistent cinematic direction, never stock.

### Spacing / layout
- Extreme whitespace around the serif headlines; content sits in generous rounded cards (`~6px` radius on buttons, larger on cards) with hairline `1px` borders on near-black.
- **Horizontal rails everywhere**: cities, event cards, learn categories all scroll sideways inside the vertical page — a "there's always more, keep swiping" texture.
- Glassmorphic translucent strips (the client-logo bar: OpenAI, Google, Microsoft, ElevenLabs, Lovable, sarvam.ai, Meta, Palantir).

### Motion (inferred from DOM/CSS + frame diffs)
- **Scroll-scored reveals**: sections fade + translate up as they enter; the "Level 1 → Level 4" block is a **pinned card-stack scrollytelling** sequence (four cards resolve to near-identical Y and animate through as you scroll — "wherever you start, you leave at level 4").
- **Live countdown timers** ticking by the second, on both home and pricing.
- **Continuous ambient hero animation** (the starfield/gradient never settles — this is literally what blocked our screenshots).
- Nav items carry a **rounded pill highlight** on active/hover.

### Microcopy register — confident, concrete, anti-hype, faintly irreverent
Real quotes worth keeping as a tone reference:
- "**Get scary good at AI in a week**"
- "This isn't a talk about agents. **It's a working room** where you bring one real process you own and rebuild it from scratch."
- "You don't leave with a PDF. **You leave with a URL, a repo, and a written verdict on both.** Things you can send someone."
- "Real credits from AI companies (**no discount BS**)."
- "A private Slack where you get **brutal feedback and meaningful connections — not a lurker forum**."
- "Every weekend, a room where something gets built. **Not demoed, not debated.**"
- "If you don't own a workflow you can rebuild in the room, **this isn't the right one for you.**" (a *disqualifier* — see §4)
- Gated chat placeholder, self-aware: "yeah i'm dummy text, don't get attached" / "register below to see what's really buzzing inside."

The whole voice is second-person, outcome-first, and slightly gatekeeping. It never says "learn" — it says "ship," "build," "leave with."

---

## 3. Event / session UX — the part that maps to cohort-room sessions

The **event detail page** (`/events/{slug}`) is the strongest thing on the site and the most directly transferable. It treats a single session as a **staged moment**, not a calendar link. Anatomy (`growthx-event-poster-agents.png` is the poster):

**Sticky left sidebar (persists while the right column scrolls):**
- Art-directed poster with a **status badge overlaid** — violet "⚡ FILLING FAST" (or "SOLD OUT" elsewhere).
- `HOSTED BY` → host cards: circular avatar + name in mono caps.
- Urgency banner: "Grab your spot before it's gone!"
- `PRICE ₹519` + a persistent blue **REGISTER →** button (always in view — the conversion anchor).

**Right column (the content):**
- Big bold title (Gilroy, not serif).
- **Two info chips side by side:**
  - A **calendar chip** — a stacked `JUL / 18` block + "Saturday, July 18" + "10:00 AM – 02:00 PM **IST**" (timezone spelled out and *underlined* — a calendar/timezone hook).
  - A **location chip** — pin icon + `CITY` label + "Gurugram / Haryana".
- **`GUEST LIST >`** — an overlapping avatar stack of who's attending (social proof / FOMO, tappable).
- **`About`** — narrative second-person copy that reframes the session as a working room.
- **`How the afternoon runs:`** — a literal **minute-by-minute run-of-show**:
  > 10:00 doors open, the core method · 10:30 map a real process · 11:15 score every step ("this is the part where it clicks") · 12:15 redraw the workflow · 12:30 spec your stack · 1:30 define done, commit, share out.
- **`What to bring:`** — a 3-item checklist ("One process you actually run", "A laptop", "That's it").
- **`Who is this for?`** — qualifying copy that ends on an explicit disqualifier.
- **`Who's hosting`** — credibility-framed bios; host cards carry **"Member since 2024"** tenure.
- **Trust note:** "the registration fee covers food and venue rent. **GrowthX does not make any money from this.**"
- **`Things to know`** — four emoji cards (💻 bring laptop · 📋 pick a process · 🕙 doors at 10 · 🚫 no refunds for no-shows → "mark 'Opt-out' early so someone else can take your spot" — implies a waitlist behind the scenes).
- **`Where will you be?`** — a map with the address **deliberately withheld**: "This map is just an approximate location. **Register to see the exact address.**" (exclusivity gate).
- **Event-specific FAQ accordion** ("How long is the session?", "Will there be a recording?").
- **`Event Chat`** — a **threaded chat preview**: avatars, names, "a day ago" timestamps, messages, and **emoji-reaction pills with counts** (👋 4, 😂 3, 🤖 5), connector lines for replies — but seeded with self-aware dummy copy and a final "register below to see what's really buzzing inside." The social layer is *shown but gated.*

**Countdowns / calendar / artifacts, specifically:**
- **Countdowns**: live early-bird timers on home + pricing (DAYS/HOURS/MINUTES/SECONDS as individual boxed digits). Event pages lean on scarcity badges + "Grab your spot" instead of a per-event countdown.
- **Calendar hooks**: the stacked `MON / DD` chip + explicit underlined timezone; a `Share` button top-right for virality.
- **Post-session artifacts**: recordings are a recurring promise — "you join live, ask questions, and **get the recording**"; pricing lists "**access all past recorded classes**" and a **"Past events"** filter on `/events`. The artifact story exists but its *player/library* is behind login (§6).

> **Direct hit on our gap G2** ("Live sessions are a link, not a moment"). This page is the reference implementation of a session-as-moment: poster, hosts, run-of-show, guest list, gated chat, scarcity, address-gating, recording promise — all on one screen.

---

## 4. Onboarding / acceptance / exclusivity staging

Membership is application-gated, and GrowthX stages the exclusivity relentlessly and consistently:

- **The word in the nav changes to "Check Eligibility"** on the deeper surfaces — you're being assessed, not sold to.
- **The login page IS the exclusivity pitch** (`growthx.club/login`): a full-bleed **grayscale photo mosaic** of real members at dinners/meetups/networking, over a black card headlined "***Access the club.***" (serif italic), logo subtitled `MEMBERSHIP`. Entry is phone-OTP or "Login with password"; non-members get a distinct **"Apply for membership"** pill. Two different doors: members *log in*, outsiders *apply*.
- **Tenure as status**: "**Member since 2022 / 2024 / 2025**" recurs on host cards and testimonials — belonging is time-stamped and flexed.
- **Disqualifiers in the copy**: "If you don't own a workflow you can rebuild in the room, this isn't the right one for you." Telling people *not* to join reads as confidence and raises perceived selectivity.
- **Scarcity mechanics**: "FILLING FAST" / "SOLD OUT" badges, no-show opt-out etiquette ("so someone else can take your spot"), early-bird countdown.
- **Value anchoring at the ask**: pricing leads with "**ACCESS WORTH $10,000**" before showing ₹14,999 — and reframes the fee as almost incidental ("GrowthX does not make any money from this").
- **The directory as the prize**: "5,000+ member directory — find leaders in top AI companies, top startup founders, CXOs from D2C/SaaS." Membership is sold as *who you get access to*, not what you learn.

The actual accepted/rejected/waitlisted *acceptance moment* (application status UI, welcome sequence) is behind the wall — but the framing around it is the whole marketing site.

---

## 5. Steal / Adapt / Skip — mapped to LevelUp cohort-room surfaces

Academic framing throughout (cohort · session · syllabus · faculty · enrollment · cohort dashboard). Surface names reference `ROOMS-ARCHITECTURE.md` / `COHORT-LOGIC.md`.

| GrowthX pattern | Verdict | LevelUp cohort-room surface & how to apply |
|---|---|---|
| **Session detail = staged "moment"** (poster, faculty, run-of-show, guest list, scarcity, gated chat on one page) | **STEAL** | The **session detail page** inside a cohort room. Directly closes **G2**. Promote a live session from a link to a page with a stacked date chip, faculty card, published agenda, and enrolled-participant avatars. |
| **Minute-by-minute run-of-show** on the session page | **STEAL** | Add a `session_agenda` field; render a timestamped syllabus block ("10:00 orientation · 10:30 …"). Sets expectations, reads rigorous. |
| **Persistent left icon-rail** as the app shell | **STEAL (constrained)** | Fits the "every cohort is its own room" container model. Use for the in-room nav (Overview · Sessions · Community · Resources · Directory) with per-cohort theming — respect the room motion/perf budget in §7.2 of ROOMS-ARCHITECTURE. |
| **Three-font system** (editorial serif + geometric sans + mono micro-labels) | **ADAPT** | Map to per-cohort `theme` tokens. Keep the *mono micro-label* idea (`SESSION 03`, `FACULTY`, `COHORT`) — it's the cheapest premium lever. Don't adopt Instrument Serif globally; let each room's theme choose its display face. |
| **Palette flip at the commitment moment** (dark → warm cream on pricing) | **ADAPT** | Use a deliberate tonal shift for the **enrollment / acceptance** screen so it feels like a distinct, warmer beat vs. the working surfaces. |
| **Gated community preview** (threaded chat shown with dummy content + reaction counts, unlock on join) | **STEAL** | Closes **G4** (no communication layer). On the pre-enrollment cohort page, *show* the discussion surface (threads, reactions, member avatars) in a locked/teaser state to sell the social layer before granting it. |
| **Guest-list / enrolled-cohort avatar stack** | **STEAL** | On session + cohort pages: "who's in this cohort/session." Cheap social proof; reinforces the room as a *place with people*. |
| **Tenure badges** ("Member since 2024") | **ADAPT** | An **alumni/standing** badge on member cards and the directory — feeds **G5** (the missing third act): cohort completion becomes durable status. |
| **Member directory framed as the prize** | **ADAPT** | A **cohort/alumni directory** as a first-class room surface, gated by entitlement. Position access to peers/faculty as a core deliverable, not an afterthought. |
| **"Check Eligibility" / "Apply" language + disqualifier copy** | **ADAPT (carefully)** | Leverages our existing **application status machine** (`cohort_applications.status`). Selective, confident framing fits premium cohorts; tune the disqualifier tone to LevelUp's warmer brand rather than GrowthX's gatekeeping edge. |
| **Recording / "past sessions" promise + past-events filter** | **STEAL** | The **third act (G5)**: a per-cohort **session archive / recordings library** so a finished session leaves an artifact. Pair with the run-of-show so recordings inherit chapter structure. |
| **Address / real-content gating** ("register to see the exact address") | **ADAPT** | Generalize to *entitlement-gated reveals*: show a session/resource exists, reveal specifics (join link, materials, exact room) only to enrolled members. Aligns with the entitlement resolver. |
| **Live ticking countdown** to early-bird / start | **ADAPT (sparingly)** | A tasteful **"cohort starts in / enrollment closes in"** countdown on the enrollment page only. Skip per-session countdowns — clutter. |
| **Scarcity badges** ("FILLING FAST / SOLD OUT") | **ADAPT** | Honest **"seats remaining / cohort full / waitlist"** state on enrollment. Only if seat caps are real — false scarcity would misfire for LevelUp. |
| **Value-anchor line** ("ACCESS WORTH $10,000") | **SKIP / soften** | The hard-dollar anchor + "we make no money" framing suits GrowthX's community-nonprofit positioning; for LevelUp reframe as concrete outcomes/deliverables rather than a headline dollar figure. |
| **Scroll-scored pinned scrollytelling** (Level 1→4 stack, ambient hero animation) | **SKIP (for in-room)** | Beautiful but heavy — it literally blocked capture and would blow the in-room motion/perf budget. Fine for a *public marketing* cohort landing page; keep working surfaces calm and fast. |
| **Emoji-heavy "Things to know" cards + emoji interest clouds** | **SKIP / minimize** | Reads slightly consumer/casual; use restrained iconography to stay on LevelUp's more considered register. |

---

## 6. What needed login (couldn't reach)

Everything below the "Access the club." wall — and, separately, Rahul's own session (the `claude-in-chrome` extension wasn't connected, so even his logged-in state was unreachable this run):

- **The members' dashboard / cohort home** — the actual in-room experience (MUI app shell); the "world-class room" we most want to benchmark.
- **The real live-session room** — join flow, live UI, in-session chat/Q&A, the "session as a moment" *while it's happening*.
- **The real community** — the private Slack-style threads (only the dummy-seeded event-chat *preview* is public) and the **5,000+ member directory**.
- **The course/recording player** — lesson UI, progress, "past recorded classes" library (the post-session artifact experience).
- **Onboarding / acceptance flow** — what happens after "Apply for membership": application status, welcome/acceptance staging, first-run.
- **Perks redemption** — the `/privileges` claim flow for the credit partners.

**To get the members-area pass:** reconnect the `claude-in-chrome` extension (sign the Chrome side-panel into the same account) so Rahul's existing GrowthX session can be inherited, then re-run against `/login` → dashboard. Rahul offered his login; that's the unblock. Nothing members-only was reached or attempted this session.

---

## Appendix — hard reference values

- **Fonts:** Instrument Serif (display; italic lead words) · Gilroy Bold/SemiBold/Medium (UI/body) · DM Mono (labels, 10px / +1.6px tracking / `#A3A3A3`).
- **Colors:** bg `#060606` · text `#FFFFFF` · label `#A3A3A3` · accent/CTA `#0064FF` · urgency violet (badges/banners) · gold gradient (early-bird) · warm cream (pricing surface).
- **Hero H1:** 130px / weight 400 / letter-spacing -5.2px / line-height 125px.
- **Build:** Next.js marketing (Tailwind tokens) + Material UI app/event pages (inner scroll container).
- **Program shape:** 4-day cohort ("ship by Sunday") + 1-yr membership (weekly 90-min expert Zooms + recordings, monthly city build-events, private Slack, 5,000+ directory, ~$7–10k credits). Early bird ₹14,999 → standard ₹19,999. Per-event fee ₹519 / flat $5 venue.
- **Client logos shown:** OpenAI, Google, Microsoft, ElevenLabs, Lovable, sarvam.ai, Meta, Palantir.
