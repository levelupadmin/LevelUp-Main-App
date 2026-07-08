# Community v2 — The Commons
### One room for everyone. Craft-agnostic, sorted without walls, world-class generic.
*Authored 2026-07-08 on `design/phase-6`. This RESETS `design/community/` (STRATEGY/ARCHITECTURE/UI-DIRECTIONS/PROTOTYPE — "The Programme", craft houses, gated editions), which Rahul rejected. Directions doc ONLY — per the standing show-options-first rule, no prototype until Rahul picks. Companion: `COMMONS-BACKLOG.md`.*

---

## 0. The corrected brief

The rejected design put the specificity in the community: houses per craft, gated edition rooms, locked doors, craft-named rituals. Rahul's inversion: **specificity, exclusivity and theming belong to COHORT ROOMS (see `design/cohorts/`) — the community is the opposite: one shared, craft-agnostic commons** where a filmmaker asks the AI person, the writer critiques the editor's cut, and anyone can walk in and plug in. Cross-pollination is the point, so walls are the enemy. The bar he set: *very well sorted, very good-looking, very creative and out-of-the-box — but not hyper-specific for the craft.*

So the design problem is precise: **sorting without segregating, and status without gamifying** — in one space, one look.

## 1. What we kept from the rejected work, and what we killed (explicitly)

### Kept (these were right, and they transfer)
- **The anti-patterns table** (old STRATEGY §4) — ghost town, void reply, unmoderated noise, engagement-bait drift, cross-posting mush, the 74k-lurker illusion. Every defense re-lands here minus the house-scoping: first-post rescue, posting structure, honest counts, feeds that END.
- **The calm-FOMO doctrine's *calm* half** — no red badge counts, no streaks, no fake scarcity, no infinite scroll, no unread anxiety, notification caps, session length is not a KPI. The *FOMO* half (locked doors, teases, editions) is killed here — exclusivity now lives in cohort rooms and on offering pages, where it's honest.
- **Moderation & roles machinery** — reports → mod queue → soft-delete/mute → mod log; roles derived not claimed (member/alumni/host/mentor); posting policies per surface. Transfers nearly verbatim (draft SQL reuse mapped in COMMONS-BACKLOG M0).
- **The crit format ("Dailies") — survives craft-agnostification, renamed "Work on the table" (post kind `work`):** work link/media + "what I need" asks (free-form chips now, not per-craft presets) + threaded notes + the author's **"this helped" mark** + a resolution close ("posted the revision — thanks @arjun, @meera"). Nothing about that loop was craft-specific except the ask presets; generalized, it's the strongest help-seeking mechanic we have.
- **The entitlement/identity backbone** — member numbers, derived roles, `helped` as the only currency, materialized membership pattern. Simplified: ONE community, so the rules/editions engine shrinks to a single all-members space + role grants (the mapping table survives in vestigial form for mentor/host grants and a future alumni flag).
- **Schema bones** — `community_threads/replies/reactions`, counters, keyset pagination, soft deletes, the feed RPC shape, the one-access-function doctrine. COMMONS-BACKLOG M0 maps which draft-SQL blocks copy over.

### Killed (and why)
- **Houses per craft** — walls. The entire container hierarchy (`communities`/`community_editions`/rooms-per-house) collapses to one space with **topics as metadata, not places**.
- **Editions/doors/teases inside the community** — the locked-door FOMO layer read as the product's centerpiece and it's what "very bad" was pointing at: a commons where most doors are shut to you is a corridor, not a home. Cohort teasing belongs on offering pages (money surfaces) and cohort rooms are invisible until you're in.
- **The Programme as the home surface** — a programme-guide home stakes the product on admin programming discipline per house, forever (the old UI-DIRECTIONS admitted this for Direction C; it was true of A too). A commons must be alive from *member activity*, not curation. (A light "happening this week" strip survives as a module, not the spine.)
- **Craft-named rituals** (Dailies/Pages/Cuts per house) and per-house ask presets — replaced by one shared vocabulary.
- **Per-house ICP theming** — the commons has ONE look: the app's own calm-luxury system. No sub-brands inside it.

## 2. Shared foundations (all three directions below assume these)

- **One space, one feed, topic flairs, no walls.** Post kinds: `ask` (I need help), `work` (show your work — the crit loop), `win`, `resource`, `post` (open). Topic flairs from a small admin-curated set (AI · Film · Writing · Editing · Content · Career · Gear · Open) — a post carries 1 kind + ≤2 topics. Filters filter; they never relocate.
- **The default feed is the product.** Sorting is by *usefulness-now*, not recency alone: open asks with zero answers get lift, fresh work gets eyes, resolved things sink gracefully. No engagement-weighted algorithmic ranking (that's the casino) — a small, legible, documented sort.
- **Status = helped.** The author of an ask/work marks the notes that helped; helped-counts accrue to the helper quietly (profile line, monthly "most helpful" naming — no points, no XP, no leaderboards v1). Identity line under every name: `MEMBER #4,211 · Chennai` (+role wordmark when mentor/host/alumni).
- **The look:** pure black, champagne/cream, Instrument Serif italic for emotional lines, mono for meta, grain ≤4% on the masthead only, one champagne moment per screen, feeds END with a terminus. Passes the AI-slop test by being creative in *structure and interaction* (below), not costume.
- **Perf:** one RPC per surface open, keyset pagination, denormalized counters, no realtime v1, mid-range-Android 60fps, 44px, reduced-motion, hover-gated.

---

## 3. The three directions (pick one — nothing gets built before that)

### Direction A — **"The Floor"** · one great room, sorted by what needs you
**Metaphor:** a studio's shared floor. Everyone's work and questions on one big table; the room quietly hands you the thing you can help with.

- **Home:** a single masthead ("The Floor" + serif line: *"Ask anything. Show anything."*) over ONE feed. Top of feed: a rotating **"Needs eyes"** slot — one open ask or unanswered work, chosen by the sort (zero answers, oldest first), framed as an invitation ("Be the first note"). Then the mixed feed with kind/topic flairs. A slim filter rail (kind + topic chips) that filters in place.
- **Interaction signature:** the *first-note rescue* — answering something with zero replies is visibly honored (a quiet "first note" mono tag on your reply, forever). The void-reply killer as a first-class mechanic.
- **Pros:** simplest mental model (one room, one feed — maximum commons); cross-pollination is structural (everything collides in one stream); cheapest to build (one surface + thread page); the "needs eyes" slot gives it a heartbeat without any admin programming.
- **Cons:** at high volume a single stream gets noisy even with flairs (mitigation: the sort + filters, but it's real); asks and works compete for the same attention; the least "out-of-the-box" of the three — structurally closer to a (very disciplined) classic feed; browsing by intent ("I want to help" vs "I want to show") isn't spatial, only filtered.

### Direction B — **"The Exchange"** ★ RECOMMENDED · asks and offers, two counters, one room
**Metaphor:** a creative exchange/trading floor for help. One room, but the *structure* is the two things people actually come to do: **get help** and **show work** — staged as two counters of the same hall, with wins and resources flowing through both.

- **Home:** a masthead with the commons' one serif line (*"Someone here knows."*), then a **two-lane top deck**: left **OPEN ASKS** (mono ledger rows: ask title, topic flair, "0 notes · 2h" — zero-answer asks pinned to the top of the lane), right **ON THE TABLE** (fresh work cards awaiting notes). Under the deck, the mixed feed (everything, including wins/resources, chronological-ish with the usefulness sort). On mobile the deck is two stacked, horizontally-snapping rails.
- **The help loop is the product:** posting an `ask` walks a 3-field composer (what I'm making · where I'm stuck · what would help) — structure that makes questions answerable (the single biggest quality lever in help communities). Answers carry the helped-mark loop; a resolved ask renders its accepted note inline (the knowledge artifact compounds — the commons accumulates a searchable answer library, which no WhatsApp group can hold).
- **Status:** helped-counts + the monthly named honor ("This month, {name} left the most helped notes") — one line in the masthead, no leaderboard page (R-C4).
- **Interaction signature:** **the answer earns its place** — when the asker marks a note "this helped," the note visually settles into the ask's card (champagne tick, the thread's one champagne moment) and the ledger row flips from OPEN to ANSWERED with the helper's name on it. Status is *watching your name get attached to solved problems*.
- **Pros:** directly embodies Rahul's example ("a filmmaker might need help with AI"); the two-counter deck is genuinely structural creativity (not a costume) while staying one room; produces compounding value (answered-asks library); help-seeking gets the dignity of structure, which raises answer quality; degrades gracefully at low volume (3 open asks still read as a living ledger, where a thin feed reads dead).
- **Cons:** the composer structure adds friction to asking (mitigation: the 3 fields are optional beyond the first); two lanes + feed is more build than A (one extra surface region + sort variants); over-indexing on asks could make it feel like a support forum if wins/works are under-loved (mitigation: ON THE TABLE is co-equal by design; the feed mixes everything).

### Direction C — **"The Daily Edition"** · the commons as a daily paper
**Metaphor:** a member-made daily. The home surface opens with today's **Edition** — an automatically composed digest block (masthead with date, "EDITION №214" mono): the best unanswered ask, one work needing notes, yesterday's best-helped note as a pull-quote, one win, one resource. Below it, the open floor (the full feed, direction-A style).
- **Interaction signature:** the pull-quote — great notes get *quoted* on the front page, author credited. Writing a genuinely helpful note can put your words on tomorrow's edition: the most literary status mechanic of the three.
- **Pros:** the most distinctive daily-open ritual ("what's in today's edition?"); showcases quality over volume (great for a small community's early months); the edition composes itself from activity (no admin curation dependency — this fixes what killed the old Direction C).
- **Cons:** an auto-composed edition needs enough daily activity to never repeat or look thin — at cold-start volume the edition recycles visibly (the failure mode is public); the edition block is editorial UI with real build cost (typographic layout engine for variable content); it *frames* the commons rather than *structuring* it — underneath, it's still Direction A; dated front pages create a subtle streak-pressure ("I missed 3 editions") that flirts with the anxiety mechanics we ban.

### Recommendation — and what gets absorbed
**Build B, "The Exchange."** It is the only direction whose *structure* answers the brief's core sentence (generic help-seeking across crafts), it beats A on out-of-the-box while staying one room with one look, and it beats C on cold-start honesty (a ledger of 3 open asks looks alive; a thin daily edition looks dead). **Absorb from A:** the first-note rescue tag and the needs-eyes discipline (they're the OPEN ASKS lane's sort). **Absorb from C (phase 2, optional):** the best-helped pull-quote as a weekly (not daily) masthead moment once volume supports it.
Rahul picks; the backlog's M1+ is written against B with the divergence points marked.

---

## 4. RAHUL DECISIONS (defaults recommended)

| # | Decision | Recommended default |
|---|---|---|
| **R-C1** | Direction pick (A/B/C) | **B — The Exchange** (this doc's argument; his call, before any UI work) |
| **R-C2** | Who's in the commons? | All authenticated members (any purchase or free account). The ~74k legacy alumni: YES, included — the commons is the funnel's warm room; honest *active* counts only (90-day activity), never "74,000 members". |
| **R-C3** | Status mechanics v1 | Helped-marks only + first-note tag. Monthly named honor starts month 2 (needs a month of honest data). No points/XP/leaderboards, ever, per the calm register. |
| **R-C4** | Topic flair set | Admin-curated 8 (AI · Film · Writing · Editing · Content · Career · Gear · Open); members request, admins add. Free-tagging = mush. |
| **R-C5** | Mentor presence in the commons | Mentors can post/note like anyone (wordmark shows); NO promised cadence, no mentor-branded surfaces — scarce-presence promises live in cohort rooms/offerings now. |
| **R-C6** | Media in posts v1 | Link embeds + images (existing storage patterns); no native video upload (cost + moderation), same as the old R10. |
| **R-C7** | Old feed migration | Copy `community_posts` (non-cohort-scoped) into the new tables idempotently (`legacy_post_id`), old page stays live until parity cutover — the old design's migration mechanics were sound and transfer (COMMONS-BACKLOG M0/M3). Cohort-scoped posts migrate to cohort-room feeds (rooms R3-T3), not here. |
| **R-C8** | DMs | No. Unchanged reasoning (moderation/safety surface; WhatsApp exists). |
| **R-C9** | Anonymous asks | NO v1 — identity (member number) is the trust fabric; revisit only if ask volume shows shyness is a real blocker. |

## 5. Sequencing honesty

- **Blocked on R-C1 (the pick):** all member-facing UI (COMMONS-BACKLOG M1–M3).
- **NOT blocked:** M0 schema — threads/replies/reactions/moderation/helped are identical across A/B/C (the directions differ in *surface composition*, not data). M0 can enter council in parallel with the pick. The commons and cohort-rooms R0 councils should be scheduled together — same reviewers, same doctrine, shared adversarial-suite patterns.
- **Cross-program:** post-card/composer primitives should be built once and shared with cohort-room feeds (rooms R3-T3 waits for this pick — noted in both backlogs).
