# LevelUp Community — Design Directions
### Three named directions for "not a regular feed", one recommendation, one prototype
*Per Rahul's standing rule: 2–3 named directions before anything gets built. All three extend the private-screening-room world (pure black, champagne/cream, Instrument Serif italics, film grain, calm luxury) — they differ in **spatial metaphor**: what the community *is* when you walk in. The recommended direction is built as `PROTOTYPE.html` (self-contained, phone-width).*

The shared brief all three answer: no infinite feed; gated editions tease without resentment; mentor presence staged as scarce; the crit thread is the hero content type; cold states never look dead; mid-range-Android motion budget (transform/opacity only).

---

## Direction A — **"The Programme"** · a screening-lounge programme guide ★ RECOMMENDED

**Metaphor:** the community is a *venue with a nightly programme*. You don't scroll what happened — you check **what's on**. The home surface is a playbill, not a feed.

- **IA:** Programme (home) → Houses (one per craft) → Rooms → Threads. Editions appear twice, deliberately: as rooms inside their house (members) and as *Doors* on the Programme (everyone — locked or open).
- **Home surface (the playbill):** a dated masthead ("Monday 7 July · The Programme"); a **Happening Now** bar when a ritual is live ("Crit night · Filmmaking · 24 inside" — champagne pulse, the only motion on the screen); **Tonight** and **This Week** as a *time-column playbill list* (mono time, serif-italic title, house wordmark) — editorial rows, not card grids; **Your Rooms** — small stack of the rooms where something needs you ("Your dailies got 2 notes"); **Doors** — the editions shelf, open doors and locked doors in one row of tall door-slabs.
- **Gated tease:** a locked programme row renders exactly what a corridor poster would: title + time + house + a small lock ("Private screening · Forge Goa '26"). Tapping opens the door page: crest, honest count ("31 filmmakers"), the programme's *titles* only, tease copy, and one quiet path-in line ("Applications open March"). No blurred content screenshots — blur implies you *almost* have it; a poster implies you could *earn* it.
- **Mentor staging:** mentor drops are *programme events* ("Thu · A note from Nelson Dilipkumar · The Noticeboard") — anticipated, dated, archived in an append-only room that reads like a director's bulletin wall.
- **Crit thread ("Dailies"):** the work sits top like a screen (16:9 frame or link card), the asks read as a slate ("LOOKING FOR: pacing · sound"), notes below carry optional mono timecodes (`02:14`) like editor's marks, the author's "helped" mark renders as a champagne tick + "this helped", and a resolved thread closes with a credits block ("Director's cut posted · notes: Arjun, Meera").
- **Cold/empty states:** structurally rare — the programme always has a next item (seeded rituals per STRATEGY §5); an empty room says "First screening {date}. Doors open." in serif; feeds end with "You're all caught up. Tonight at 8: Dailies."
- **Why it wins:** it is FOMO-native (a programme is *inherently* about what you'd miss), it converts admin programming discipline into user-visible life, it maps 1:1 onto `community_programming` + rooms with zero exotic UI physics, and it is the most literal extension of "private screening room" the brand has.

## Direction B — **"The Green Room"** · a members' club of doors

**Metaphor:** backstage corridor. Home is a *hallway of doors* — your houses lit warm, each door ajar showing a one-line peek (last thing said, who's inside); locked editions are frosted-glass doors with a brass nameplate and silhouette count.

- **IA:** Hallway → open a door → the room's *table* (threads as papers on a table, most-recently-touched on top) → thread.
- **Gated tease:** the frosted door — nameplate, crest, "31 inside", muffled programme titles. Beautiful, and the strongest pure-FOMO image of the three.
- **Mentor staging:** the mentor has a *named door* ("Nelson's Noticeboard") that lights up on drop days.
- **Crit thread:** "the table read" — same dailies format as A.
- **Risks (why not recommended):** the corridor is a *navigation* metaphor, so it must be rendered semi-literally (door slabs, light, frosting) to read at all — that's a decorative surface Rahul's AI-slop test will rightly interrogate, a `backdrop-filter` temptation the Android budget forbids, and a layout that gets cramped at 360px. It also centers *places* over *time* — quieter houses look like dark doors, which is ghost-town-visible. **Absorbed into A:** the Doors shelf and the door-page tease are B's best ideas, kept.

## Direction C — **"The Call Sheet"** · the daily production ritual

**Metaphor:** you're crew. Every morning each house issues a **call sheet**: today's date, one ritual, one dailies that needs eyes, one drop, one door. Reading it takes 90 seconds; contributing is the point.

- **IA:** Today's call sheet (home) → items deep-link into rooms/threads; houses reachable from a secondary index.
- **Home surface:** a document, not an app screen — mono header block (date, house, "CALL SHEET №214"), numbered items, serif pull-quote of the day from a member's note.
- **Gated tease:** a call-sheet line item: "CLOSED SET — Forge Goa '26 (crew only)".
- **Mentor staging:** "ON SET TODAY" line when a drop lands. Electric when it happens.
- **Crit thread:** identical dailies format.
- **Risks (why not recommended):** it's the boldest and most habit-forming, but it *demands* flawless daily programming per house forever — a thin call sheet reads as a dead production instantly (the failure mode is worse than a quiet feed). It also under-serves browsing/depth (alumni networks, old threads). **Absorbed into A:** the "one thing that needs you" discipline becomes A's Your Rooms block; the call-sheet document typography seeds A's masthead.

---

## Recommendation

**Build Direction A, The Programme,** with B's Doors shelf and C's needs-you discipline absorbed (both already folded into A's spec above). It is the only direction where the brand metaphor, the FOMO engine, the data model (`community_programming` is literally the home surface), the Android perf budget, and the admin's real-world discipline level all point the same way. B is a skin; C is a commitment; A is a *system*.

**Register notes for the builder (all screens):** pure black canvas; champagne reserved for exactly one moment per screen (Happening Now pulse, the helped tick, the door's path-in); serif italic for titles and emotional lines only; mono for times/counts/slates; grain at ≤4% on hero surfaces only; transform/opacity motion from the existing token system (`springs.glide` for surface entrances, `snap` for presses); every row ≥44px; feeds paginate and END.

## The prototype

`PROTOTYPE.html` — self-contained (inline CSS/JS, zero external assets, serif fallback stack approximating Instrument Serif italic), phone-width, four key screens of Direction A:

1. **The Programme** (community home): masthead, Happening Now, Tonight/This Week playbill, Your Rooms, Doors shelf (open + locked).
2. **The Filmmaking House:** house masthead, Noticeboard drop pinned, rooms index, this week's house programme.
3. **A locked door** (Forge Goa '26 tease): crest, honest count, programme titles only, tease copy + path-in.
4. **A Dailies thread:** work frame, asks slate, timecoded notes, mentor note treatment, helped marks, credits/resolution block.

It is a *design artifact for Rahul to react to* — not production code, no real data, interactions are simulated (screen switching, respect tap, helped tick).
