# LevelUp Community — Product Strategy
### From a generic feed to the members' wing of the screening room
*Authored 2026-07-07 on branch `design/phase-2`. Grounded in: the live CommunityPage audit (`design/community/shots/current_community_375x812.png`, `current_community_360x740.png`), the real data model (`enrolments`, `offerings`, `cohort_applications`, `cohort_batches`, `legacy_enrolments`, `users.member_number`), DESIGN-STRATEGY.md (private-screening-room doctrine), and design/vision/REPORT.md (this work SUPERSEDES P4-T8 "Community feels alive" and the Phase-9 "living community" line-items — anything good in them is absorbed here).*

*Companions: `ARCHITECTURE.md` (the backbone + draft SQL), `UI-DIRECTIONS.md` + `PROTOTYPE.html` (the look), `EXECUTION-BACKLOG.md` (the build plan).*

---

## 0. The honest starting point

Today `/community` is one flat feed: a composer, 50 newest posts, hearts, comments, and a cohort scope-toggle that only appears for live-cohort students. It is structurally a worse WhatsApp group — same flat stream, fewer members, no notification pull. The editorial header ("Talk to *your* people") is the only thing worth keeping; the REPORT.md verdict ("a static feed… plain-div post cards") is correct but understates the problem: **the issue is not polish, it's that a feed is the wrong product.** Nobody opens a fifth social feed. People open a place where something is *happening* and where they have *standing*.

What LevelUp uniquely has — and no Discord server or WhatsApp group can fake:

1. **Real entitlements.** Every member's identity is backed by money and effort: a Ravi Basrur masterclass purchase, an accepted AI-cohort application, a Forge edition seat, a `member_number` minted at signup, ~74k legacy TagMango alumni. Access and status can be *derived, not claimed*.
2. **Real mentors.** Lokesh Kanagaraj, Nelson Dilipkumar, Ravi Basrur are not "influencers in the Discord" — they are the faculty. Even scarce mentor presence, staged well, is worth more than infinite peer chatter.
3. **Real calendar.** Cohorts have weekly sessions; Forge has editions; workshops exist in the schema. A community with a programme is alive by construction; a community with a feed is alive only if you get lucky.

The strategy in one sentence: **stop building a feed, start building a members' wing — houses per craft, rooms with purposes, a nightly programme, and doors that are visibly locked for good reasons.**

---

## 1. ICP profiles per community

The five launch communities map to the five product verticals. More will be added; the profiles below are also the template for profiling community #6.

### 1.1 Filmmaking (the flagship)
- **Who:** 18–30, Tamil/Telugu/Malayalam/Kannada-belt aspiring directors, DPs, ADs; film-institute rejects and refusers; bought Lokesh (15 ep) / Nelson (29 ep) / Ravi Basrur masterclasses at ₹1,499–2,499. Phone-first, mid-range Android, data-conscious. Many are the first person in their family to attempt cinema.
- **Status they crave:** being taken seriously as a *filmmaker* before having credits. Proximity to the industry ("Lokesh's masterclass alumni" is a real sentence they say out loud). A crew — knowing an editor, a sound guy, a co-writer.
- **What they fear:** making things alone and being ignored; that without industry family they'll never get in; posting their short film and getting silence (silence is worse than criticism).
- **Daily-open trigger:** "did anyone respond to my scene?"; "what did the mentor's noticeboard drop this week?"; "who's at crit night tonight?"
- **What they'd pay for next:** Forge (travel + shoot together), live cohorts, one honest note from someone credible.

### 1.2 Writing
- **Who:** 20–35, screenwriters and fiction writers, often employed elsewhere (IT, journalism), writing nights and weekends. Overlaps heavily with filmmaking — the screenwriting product line lives *under the writing vertical but belongs in the filmmaking community too* (the canonical cross-mapping case; solved structurally in ARCHITECTURE.md §4).
- **Status they crave:** being *read*. A logline that made someone react. "First Reader" credibility — the person whose notes people want.
- **Fear:** their pages are invisible; feedback that is either cruelty or empty praise.
- **Daily-open trigger:** page-swap rituals ("50 pages club"), a weekly prompt, a mentor's script-breakdown drop.

### 1.3 Video editing
- **Who:** 18–28, freelance editors and aspiring ones; the most *employable* vertical — many are already cutting reels/weddings for money. Tool-fluent, speed-obsessed.
- **Status they crave:** being the person whose timeline others screenshot. Gigs. Speed rank ("cut this scene in 24h" challenges).
- **Fear:** commoditization — being a ₹500-per-reel editor forever.
- **Daily-open trigger:** before/after breakdowns, cut challenges, the opportunities board (the `opportunities` table already exists in the schema — this vertical is its natural home).

### 1.4 Content creation
- **Who:** 20–35, creators between 0–50k followers building a face and an income; small-business owners doing their own content. The most heterogeneous ICP — treat "creator" as the identity, growth as the shared goal.
- **Status they crave:** numbers they can attribute to craft ("this hook format got me 2×"). Being cited: "I used X's structure."
- **Fear:** the algorithm; burning out posting into the void.
- **Daily-open trigger:** hook/format teardowns, "what worked this week" show-and-tell, accountability cadence.

### 1.5 AI
- **Who:** 22–40, the widest net — creators wanting AI leverage, professionals up-skilling, Forge-AI-cohort ICP. Highest willingness to pay, lowest craft identity ("AI person" is not yet an identity the way "filmmaker" is).
- **Status they crave:** being *early and competent* — the person who shows, not talks. Working artifacts (a workflow, a generated film, an agent) beat opinions.
- **Fear:** the field moving faster than they can; being sold hype.
- **Daily-open trigger:** "what did someone build this week", model-news translated into craft moves (the `reference_latest_ai_models` discipline — Soul, Seedance, Sora 2, Veo 3 — becomes community programming: monthly "new tools, real tests").

**Cross-cutting truths (all five):** English-plus-vernacular comfort; voice notes and screenshots over long text; deep respect for hierarchy and craft seniority (mentor words carry disproportionate weight — use sparingly, stage carefully); price-sensitive but *status-generous* — they will work hard for standing that feels real.

---

## 2. The USP set — what this community offers that WhatsApp/Discord structurally cannot

1. **Proximity, staged.** A *Mentor's Noticeboard* per house: an append-only, mentor/host-only room. Even one Nelson voice note a month is an event WhatsApp can't replicate — because here it lands in a room with his name on the door, visible to exactly the people entitled to it, and *teased* to everyone else. (Mentor time is scarce: the design treats mentor presence as **programming, not availability** — drops, not DMs.)
2. **The crit format.** A structured "Dailies" thread type: work + what-I-need (asks) + timestamped notes + a "director's cut" resolution by the author. Feedback becomes a *craft artifact*, not chat scroll-back. This is the single strongest daily-value engine and nothing in WhatsApp's shape can hold it.
3. **Entitlement-backed identity.** Member #4,211. Alumni crest of Forge Goa '25. "Cohort 3, AI." These are *derived from the payments and rosters tables* — unfakeable, unclaimable, and visible on every post. Status inflation is impossible by construction.
4. **Editions — rooms with real doors.** A Forge edition room, a cohort batch room, an alumni circle: gated by what you actually did/bought, permanent (alumni keep their rooms — the network is the product's longest-tail value), and *visible but locked* to everyone else.
5. **A programme, not a feed.** The community home answers "what is happening tonight/this week", not "what was posted 4 hours ago". Crit nights, screenings, challenges, AMAs — recurring, calendared, attended. Communities with rituals survive; communities with feeds decay.
6. **The path upward is visible.** The community is also the funnel: the writing student sees the filmmaking house across the hall; the masterclass buyer sees the cohort edition's door; everyone sees Forge's window. Growth and member value are the same mechanism here — *aspiration by adjacency*, never a popup.

---

## 3. The psychology engine (calm-luxury register — every mechanic below passes the "no dopamine casino" test)

### 3.1 Belonging
- **Member number as identity:** `users.member_number` already exists — surface it everywhere ("Member #4,211 · Filmmaking"). Low numbers become quietly prestigious; new numbers signal growth. Zero implementation cost, permanent effect.
- **Houses, not channels:** each craft community is a *house* with a name, a texture, a noticeboard, and its own programme. You belong *somewhere specific*, not to "the community".
- **The first 48 hours:** a new member's induction is a ritual, not an empty composer: they're placed in their house, shown tonight's programme, and given one concrete first contribution ("leave one note on this week's open dailies"). First contribution within 48h is the activation metric (§7).

### 3.2 Status ladders (earned, slow, legible)
- **Roles (derived):** Member → Alumni (kept forever) → Host (appointed) → Mentor (faculty). Rendered as understated wordmarks next to names, champagne on black — never badges-as-confetti.
- **Contribution titles (earned):** "First Reader" (writing — most-thanked notes), "Second Unit" (filmmaking — most helpful on others' dailies), "Finisher" (completed challenges). Awarded monthly, few in number, named in the programme ("This month's First Reader: …"). Scarcity is the point; there are no points, no XP, no leaderboards.
- **"Helped" is the only currency:** reactions are a constrained vocabulary (see ARCHITECTURE §5) — the one that matters is the *author* marking a note as "this helped". Status flows from being useful to a specific person, not from broadcast applause.

### 3.3 Contribution loops
- **The Dailies loop:** post work → get timestamped notes → mark what helped → post the revision ("director's cut") → the thread resolves with credits ("notes: @arjun, @meera"). Closing the loop is celebrated (calmly); open loops surface in the programme ("3 dailies still need eyes").
- **Give-to-get gravity, not gates:** posting your own dailies is never blocked, but the induction ritual, the titles, and the "needs eyes" rail all pull toward giving notes first. (A hard give-to-get gate is an anti-pattern — it produces obligation feedback, which is worse than silence.)

### 3.4 Healthy FOMO (exclusivity that breeds aspiration, not resentment)
- **Locked doors you can read the nameplate on:** every edition is visible as a door — name, crest, member count, the *titles* of its programme ("Tonight: Cut review with the Forge Goa crew") — but never its content. The tease copy states the honest path in: "Members of Forge Goa '26. Applications open in March."
- **Happening Now:** a slim live bar when any ritual is in session ("Crit night · Filmmaking · 24 inside"). Missable, dated, real — FOMO from *events*, never from unread-count anxiety.
- **Alumni-only rooms as the long game:** the Forge alumni room's existence does more selling than any sales page. The rule that makes it healthy: **the tease is always attached to a legitimate path in** (apply, buy, attend). Locked with no path = resentment; locked with a path = aspiration.
- **What we never do:** red badge counts, streak guilt, "X people are viewing", fake scarcity, unread-anxiety loops, infinite scroll (feeds paginate by *day/edition of the programme*, and end — "You're all caught up. Tonight at 8: Dailies.").

### 3.5 Rituals & programming (the heartbeat)
Per house, per week — the minimum-viable programme (launch requirement, §6):
| Ritual | Cadence | Mechanic |
|---|---|---|
| **Dailies / Pages / Cuts / Drops** (craft-named crit night) | Weekly, fixed evening | Crit threads open all week; the *night* is when hosts + members work through them live (thread-first; live session optional) |
| **The Noticeboard drop** | Weekly–monthly | Mentor/host post: a breakdown, a voice note, an assignment. Append-only room |
| **The Challenge** | Monthly | One brief ("cut this scene", "write this logline", "one reel, this hook"), submissions as threads, a screening/reading of the best at month's end |
| **First Positions** (intros) | Rolling | New-member intro thread with a format (name, city, craft, one link) — never an empty "introduce yourself" |
The programme is *content*: the home surface is literally the programme guide (UI-DIRECTIONS.md). An empty programme slot is an admin alarm, not a user-visible void.

---

## 4. Anti-patterns and structural defenses

| Death pattern | How communities die of it | Structural defense here |
|---|---|---|
| **Ghost town** | Launching wide and thin; 5 empty houses | Launch gate (§6): a house opens only with 2 committed rituals + ≥30 founding members + a host. Until then it shows as "Opening soon" — a tease, not a void |
| **The void reply** | First-time posters get silence and never return | "Needs eyes" rail surfaces zero-reply dailies to hosts + title-holders; host SLA: no dailies unanswered >24h; time-to-first-note is a north-star input (§7) |
| **Unmoderated noise** | Promo spam, off-topic floods, one loud member | Rooms have posting policies (lobby = all, noticeboard = hosts+mentors, dailies = structured form); report → mod-action pipeline; hosts can mute-in-room; `is_admin()` retains full override |
| **Engagement-bait drift** | Optimizing for opens/DAU turns it into a casino | Guardrail metrics (§7) are first-class: notification volume caps, no unread badges, feeds end. The programme — not the algorithm — decides what's on top |
| **Mentor burnout / mentor no-show** | Overpromising access | Mentor presence is *drops* into an append-only room, scheduled quarterly in advance; the UI never implies DM access or reply SLAs from faculty |
| **Cross-posting mush** | Same post sprayed to 5 houses | A thread lives in exactly ONE room (schema-enforced); cross-craft relevance is handled by the room's *audience* (mapping), not by copies |
| **The 74k-lurker illusion** | Counting legacy members as community | Legacy alumni get a door (Alumni Assembly) and an invitation ritual, but member counts shown on doors count *active* members (posted/reacted/attended in 90d) — honest numbers only |

---

## 5. Cold-start playbook — launching a new community or edition non-empty

**The rule: nothing launches at zero.** Every new container ships with pre-seeded structure, founding members, and a first ritual on the calendar.

### New community (house) — e.g. community #6 "Photography"
1. **T-14d:** Rahul creates the house + entitlement rule (one insert each — ARCHITECTURE §7); house is visible as "Opening soon" with its crest + launch date (the tease works *before* launch).
2. **T-14d → T0:** appoint 1 host; recruit 20–50 founding members by hand (best contributors from adjacent houses + the vertical's earliest buyers); founding members get a permanent "Founding member" line on their profile in that house.
3. **T-7d:** seed the rooms: noticeboard has 2 posts (host intro + "how this house works"), dailies room has 3 real works from founding members, First Positions thread is open with 10 intros already in it.
4. **T0:** launch = an *event on the programme* (first crit night), not a push blast. Members of adjacent houses see the door unlock.
5. **T+30d gate:** if weekly contribution <15%, the house goes back to "founding mode" (smaller, hand-run) rather than lingering as a ghost town.

### New edition — e.g. a Forge edition or cohort batch
1. Created automatically when the batch/roster exists (entitlement rule on the offering/batch — one row).
2. Pre-seeded: welcome post from the edition host, the edition's programme (session dates already exist in `cohort_weeks`/`live_sessions`), a roll-call thread.
3. Members auto-placed the moment their entitlement lands (acceptance, payment) — joining the room IS part of the purchase's thank-you moment ("Your seat in the Cohort 4 room is open").
4. At edition end: the room converts to an **alumni room** (never deleted, posting stays open, crest changes to alumni) — the roster table keeps working as the entitlement source.

### The Commons (cold-start insurance for the whole system)
One cross-craft space every member belongs to (the current everyone-feed's heir): First Positions, wins, announcements. It guarantees a heartbeat on day one with today's real posting volume, and it's where members of not-yet-opened houses live. **RAHUL DECISION R3** below.

---

## 6. Launch sequencing (recommended)

Phase the *communities*, not just the code: **Filmmaking opens first** (deepest ICP, three mentor names, existing cohort editions to convert), with the Commons live for everyone. Writing second (smallest distance, the screenwriting cross-map proves the mapping machinery in week one). AI third (Forge AI cohort edition converts its WhatsApp group in-app). Video editing + content creation open when the launch gate (§5) is met. Every existing cohort batch and Forge edition converts to an edition room at its own pace — WhatsApp groups stay for logistics until an edition's members have visibly moved (do not force-migrate; let the crit format and mentor drops be the pull).

---

## 7. Metrics

**North star: Weekly Contribution Rate (WCR)** — % of entitled members who posted, replied, reacted-with-helped, or attended a programme item in the last 7 days, per house. (Chosen over DAU: DAU rewards lurker-farming; WCR measures the thing that keeps *other* members coming back.)

**Input metrics (the levers):**
- Time-to-first-note on dailies (median; target <12h, alarm >24h)
- Crit loops closed per week (dailies that reached "director's cut")
- Programme attendance (per ritual; trend per house)
- New-member activation: first contribution within 48h of entitlement
- Door-tease conversion: locked-edition tease views → path-in clicks (apply/buy) — the FOMO layer's honest KPI, and the growth loop's

**Guardrail metrics (regression on these blocks shipping more engagement mechanics):**
- Notification volume per member per week (hard cap; digest-first)
- Report rate per 100 threads; time-to-mod-action
- Reply sentiment on first-time posters' dailies (spot audit monthly)
- Mentor-drop cadence kept vs promised (never let the UI promise what faculty won't sustain)
- Session length is explicitly NOT a KPI — a member who checks the programme, leaves a note, and leaves in 4 minutes is a success

---

## 8. RAHUL DECISIONS (each with a recommended default)

| # | Decision | Recommended default |
|---|---|---|
| **R1** | Launch order of houses | Filmmaking → Writing → AI → (gate) Editing, Content — per §6 |
| **R2** | Do mentors (Lokesh/Nelson/Ravi Basrur) commit to noticeboard drops, and at what cadence? | Ask for quarterly-scheduled drops, monthly per house max; UI stages scarcity either way. **This is the single highest-leverage yes.** |
| **R3** | Does the Commons (cross-craft, all-members space) exist? | YES — cold-start insurance + home for the 74k legacy alumni + heir of the current feed's data |
| **R4** | Legacy TagMango alumni (~74k): auto-entitled to the Commons + an Alumni Assembly room? | YES to Commons; Alumni Assembly opens later with an invitation ritual (avoid 74k silent members distorting counts — active-member counting per §4 regardless) |
| **R5** | WhatsApp coexistence for cohort/Forge editions | Keep WhatsApp for logistics; crit + noticeboard + programme live in-app only (the pull, not the push). No forced migration |
| **R6** | Contribution titles (First Reader etc.) in v1? | Ship the "helped" mechanic in v1; titles begin month 2 (need a month of data to award honestly) |
| **R7** | Member directory (browse members of a house)? | v1: faces on the door (avatar walls, counts) but no browsable directory — privacy-first for a young-women-heavy segment; revisit with opt-in `open_to_collaborate` (column already exists) |
| **R8** | Push notifications for community (programme reminders, "your dailies got a note") | YES but transactional-only and digest-first, riding the Phase-8 push decision in design/vision REPORT §d — community must not burn the permission grant |
| **R9** | Can members create threads in the Commons freely (current behavior) or rooms-only? | Rooms-only everywhere (the Commons has its own rooms: First Positions, Wins, Open Floor). Structure is the product |
| **R10** | Media in posts v1 (images/video links) | v1: link embeds (YouTube/Drive/IG) + images via existing storage patterns; no native video upload (cost + moderation surface) |

---

## 9. What this supersedes

- `design/vision/EXECUTION-BACKLOG.md` **P4-T8** ("Community feels alive") — its token fixes, composer choreography, and the `querySelector` hack removal are absorbed into the new build (EXECUTION-BACKLOG.md Phase C2); do not polish the old page beyond what P4-T3 (pull-to-refresh, shared file lane) already touches.
- `design/vision/REPORT.md` **Phase 9** "a living community" line-item — this program IS that phase, expanded.
- The old page (`src/pages/CommunityPage.tsx`) keeps working untouched until Phase C2 ships behind its own route/flag; its data (`community_posts` + likes + comments) migrates per ARCHITECTURE §8.
