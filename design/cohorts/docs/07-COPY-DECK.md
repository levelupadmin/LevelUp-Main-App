# LevelUp Live Cohorts — Copy Deck & Voice

*Doc 07 of the cohort product docs set · authored on the live-cohort program. Companion to `01-PRD.md` (the product source of truth). This document does not decide scope — it dresses the scope the PRD already fixed.*

*Audience is dual, like every doc in this set. A founder new to product should be able to read the voice guide (§1–§2) and understand **why** the words are the way they are; an Opus 4.8 engineering/design crew should be able to lift any string from §4 onward and drop it into a component, and the QA gate should be able to grep for the banned words in §2.4 and the verbatim locked lines in §3.*

---

## How to read this document

- **Grounding, not invention.** Every user-facing string here is either (a) lifted verbatim from an approved source (the v2 flow spec — *The Student Journey v2* — or `FLOW-FEEDBACK-R1.md`), or (b) written to a rule this document states and cites. Where a string is newly written to fill a gap the flows left blank (errors, empty states, loading), it is marked **`[new-to-voice]`** and obeys §2.
- **String IDs are stable handles.** Every string carries an ID like `CD-05-INT-03` (`CD` = copy deck · stage number · surface group · sequence). A build brief references them; the QA gate greps for the locked ones; a review is graded against them. **Do not renumber.** They are deliberately independent of the PRD's `REQ-` IDs; the "Implements / PRD link" column ties each block back.
- **Locked vs. draft.** A string tagged **🔒 LOCKED — verbatim** is approved word-for-word (a KEEP line from `FLOW-FEEDBACK-R1.md`, or an R1-approved decision beat). It must render byte-identical; changing it is a Tier-1-of-copy event that needs Rahul. A string tagged **✎ draft** is written to voice and open to Rahul's edit — but it still ships as-is unless he changes it (the default-for-everything rule this doc set runs on).
- **RAHUL DECISION — WORD-N blocks** flag every string where the *wording itself* is a genuine choice Rahul has not confirmed (a title, a euphemism, a tension between a KEEP line and the data that feeds it). Each carries a recommended default so the crew is never blocked.
- **Tier tags** appear only where a copy string sits on a Tier-1 surface per `CLAUDE.md` (auth, payments, the public page's data whitelist). Copy is almost always `🟢 Tier 3`; the exceptions are called out because the *string* is load-bearing for access control or money, not because the words are risky.
- **Per-SKU vocabulary.** Room copy (§4.8–§4.12) is written in the **academic base** and skinned per SKU by the `vocab` config key. The base string is canonical; the skinned variants live in the term table (§5). A string that contains a `{vocab.*}` token resolves at render time — never hardcode the film word.

**Companion docs (this deck must stay consistent with):**
- `design/cohorts/docs/01-PRD.md` — the product requirements; this deck's strings implement its `REQ-`s and must not contradict its scope, tiers, or RAHUL DECISIONS. Where a PRD RAHUL DECISION also has a *wording* dimension (TITLE-1, the close-time source, STANDING-1's standing labels), this deck restates it as a WORD-N so the crew sees it in one place.
- `design/cohorts/FLOW-FEEDBACK-R1.md` — the binding round-1 feedback and the source of every 🔒 LOCKED line.
- *The Student Journey v2* — the approved flow spec; the wireframe copy in it is the primary source for the ✎ draft strings below.
- `design/cohorts/inspiration/GROWTHX-NOTES.md` — the premium session-as-a-moment patterns §2.3 borrows tone from (and the "no refunds for no-shows" pattern §4.5 deliberately softens).
- `design/community-v2/COMMONS-DIRECTIONS.md` — the global commons (a separate program); §4.9's separation copy states the boundary between it and the in-room commons.

---

## 1. The voice, in one paragraph

**LevelUp writes like a good registrar at a school worth getting into: precise, warm, and never selling.** The product has already been paid for or is about to be — so the copy never hypes, never counts down with fake timers, never flatters. It states what is true, what happens next, and what it costs, in that order, and then gets out of the way. The register is *academic* (weeks, sessions, assignments, attendance, a record, a transcript) and the finish is *calm-luxury* (space, restraint, one champagne action per screen, serif for the four ceremonies and nothing else). When in doubt, say the plain true thing a person could defend on a phone call — and cut the adjective.

---

## 2. The voice guide (binding rules)

These encode `FLOW-FEEDBACK-R1.md`, the v2 "five rules," and PRD §6.3 (NFR-COPY-1..8). They are QA-checkable, not preferences.

### 2.1 Register — academic base, calm-luxury finish

- **The academic base is the spine of the whole product.** The registrar surfaces — *week, session, assignment, attendance, record, transcript, certificate* — are named plainly and **never renamed**, in any SKU, ever (PRD REQ-VOCAB-1; NFR-COPY-2). Per-SKU vocabulary (§5) skins *labels* around this spine (a submission becomes "a cut"), but the spine itself stays academic so the credential reads as a credential.
- **Calm-luxury means restraint, not ornament.** Whitespace over dividers, one idea per screen, one primary action (§2.2). Serif italic is reserved for the four ceremonies (decision reveal, unlock, Day One, certificate) and the letter — everywhere else is the system sans. Do not decorate corridor screens; "the moment is the product, everything else is corridor — keep it calm" (v2 Rule 05).
- **Sentence case, not Title Case, for everything except proper program names.** "Book my interview," not "Book My Interview." Program names are proper nouns: *Breakthrough Filmmakers' Program*, *LevelUp Creator Academy*, *The AI Generalist Program*.

### 2.2 One obvious action per state (v2 Rule 01 / NFR-COPY-7)

Every state renders **exactly one primary (champagne) button**, and its label is a verb the user would say out loud: *Finish my application · Book my interview · Open your decision · Claim my seat · Enter your cohort room · Recover Week 7 · Claim my certificate.* Secondary actions are quiet (outline) and never compete. A screen that seems to need two primary actions is two screens. QA: grep any funnel screen for >1 `.wf-btn.pri` → fail.

### 2.3 Calm urgency, never a drip (Duolingo craft, none of the guilt)

Deadlines are real and named; urgency is never invented. Every reminder counts backward from **one true event** (the review-batch close). No streaks, no "don't lose your progress!", no countdown emojis, no shame. The tone ceiling for every reminder is the KEEP line *"The one prerequisite for any cohort is the passion to learn."* (§3, `FLOW-FEEDBACK-R1.md` §9a). Cadence and caps are a hard contract (§4.4).

### 2.4 The banned lexicon (grep-checkable — QA fails on any hit)

| Banned in user-facing copy | Why | Source | Say instead |
|---|---|---|---|
| **"free"** (the whole word — near rescheduling, or anywhere it cheapens the register) | Cheapens a premium program; Rahul's explicit rule | `FLOW-FEEDBACK-R1.md` §9c; NFR-COPY-4 | "One reschedule available." / just state the allowance |
| **"counselor"**, **"mentor"** *(for the interviewer)* | The interviewer is admissions/sales, never teaching staff; conflating them spends the trust the room needs later | `FLOW-FEEDBACK-R1.md` §7; REQ-INT-2 | "Admissions Interviewer" (§4.5, WORD-1) |
| **The essay / "why" freeform text, quoted back** | People rage-type it; mirroring it is a coin-flip between magic and embarrassment | `FLOW-FEEDBACK-R1.md` §4; NFR-COPY-1 | Personalize from structured fields (name, craft, cohort, city, quiz goal) |
| **Seat numbers / "student #N" / "x of 30" fill counters** | Low numbers signal an empty cohort; leaks fill state | `FLOW-FEEDBACK-R1.md` §9i; NFR-COPY-3 | Accept-rate ratios, panel sizes, batch ledgers, roll-call-by-name |
| **"untouched" (as a scold)**, "you haven't even started", any judgmental framing | Softened per R1 | `FLOW-FEEDBACK-R1.md` §9a | "unfinished is fine", "half-made things are welcome here" |
| **Streaks / points / XP / leaderboard / flames** | Registrar register, not a game (leaderboard module OFF, R-D3) | v2 Rule 04; NFR-COPY-6 | attendance %, "Recovered", academic standing (§4.8) |
| **Invented timers / "FILLING FAST" / "SOLD OUT"** | Scarcity only when true and defensible | v2 Rule 02; NFR-COPY-3 | real batch caps, real waitlists, real application ratios |
| **"Zoom"** (assumed as the interview modality) | The student chooses Meet or phone; assuming Zoom breaks the "someone's paying attention" proof | `FLOW-FEEDBACK-R1.md` §9b; REQ-INT-1 | render the *chosen* modality; "live on Zoom" is fine **only** for the delivered room session, which is genuinely on Zoom |

> **Note on "Zoom":** the banned item is *assuming* Zoom for the **admissions interview** (Stage 05). The **cohort room's live sessions** (Stage 08) genuinely run on Zoom today, so "live on Zoom" is a true, allowed string there (`COHORT-LOGIC.md`; v2 Stage 08-B). Keep the two straight. `04-INTEGRATION-CONTRACTS.md` §6.3 is scoped to match ("Zoom is never assumed *for the interview modality*") so the two docs agree.
>
> **Note on the "free" grep gate (so it is internally satisfiable):** the QA gate matches the **whole word `free`** (word-boundary regex, e.g. `\bfree\b`, case-insensitive), **not** the substring — so legitimate words that merely contain the letters (`freely`, `freedom`, `freeform`) do not trip it, while "it's free" / "free reschedule" do. There is **no allowlist**; the whole deck is written to avoid the whole word (CD-01-HOME-04 was reworded off "browse freely" for clarity anyway). QA fails on any whole-word hit.

### 2.5 Money in daylight (v2 Rule 03 / NFR-COPY-5)

Every rupee, date, and consequence is stated **before** it is due and **before** any Razorpay sheet opens (REQ-DEC-5). No money detail is ever first seen inside the payment sheet. The ₹8,000 is always framed as "part of your program fee, not an extra." Reminders keep office hours; "doors never lock mid-class." Currency renders as `₹40,000` (grouped, no decimals) in tabular-nums.

### 2.6 Scarcity only when true (v2 Rule 02 / NFR-COPY-3)

Only numbers the team can defend on a phone call: panel selectivity ("accepts about 24%…"), review-batch admit ledgers ("Batch 12 — 41 interviewed · 11 admitted"), application ratios ("one of 30 · from 1,142 applications"), and real waitlists. Every such number must trace to a real source; if the source is unavailable, the line **hides** rather than inventing a figure (REQ-INT-3 acceptance).

### 2.7 No AI-slop costumes (NFR-COPY-8; Rahul memory `feedback_avoid_ai_slop`)

No trendy-serif costume where plain type belongs, no fake UI mockups where real data goes, no node diagrams, no count-up animations as decoration, no repetitive card grids. Creativity lives in structure and interaction, not ornament. (This is a design rule with a copy corollary: don't write copy that only exists to fill a decorative module.)

---

## 3. The locked lines (verbatim register — never edit)

These render **byte-identical**. They are the KEEP lines from `FLOW-FEEDBACK-R1.md` plus the R1-approved decision beats. QA greps for each; any deviation fails.

| ID | 🔒 String (verbatim) | Where it renders | Source |
|---|---|---|---|
| `CD-LOCK-01` | **Your application is saved. Two taps to finish. The draft is exactly where you left it.** | Reminder ladder touch 1 (T+2h); Stage 04-C lock screen | `FLOW-FEEDBACK-R1.md` §5 |
| `CD-LOCK-02` | **The review batch for this cohort closes at [time] — lock your application.** | Reminder ladder touch 2 (T+22h); Stage 04-C lock screen. `[time]` is a render token — see **WORD-2** for the date-vs-time tension | `FLOW-FEEDBACK-R1.md` §6 |
| `CD-LOCK-03` | **The one prerequisite for any cohort is the passion to learn.** | Foot of Stage 04-A open-loop screen; Stage 05-D prep sheet; the tone ceiling for all reminders | `FLOW-FEEDBACK-R1.md` §9a |
| `CD-LOCK-04` | **Your decision is ready.** → **Open your decision** → **Claim my seat** | The three decision beats: sealed screen (6A), reveal CTA, letter CTA | `FLOW-FEEDBACK-R1.md` §9d |

> **RAHUL DECISION — WORD-2: `CD-LOCK-02` says "closes at [time]" but the data is a date.**
> `offerings.application_deadline` is a `date` column (no time-of-day) today (`CLAUDE.md`; PRD REQ-INSTALL-3; migration `20260610090000`). So the KEEP line's `[time]` token can only truthfully render a **date** ("closes Sunday 3 August") unless a `timestamptz` close column is added first. The v2 flow spec renders it both ways in different places ("closes Sun 3 Aug" in 04-A; "closes at 11:59 PM Sunday" in 04-C).
> **Recommended default:** keep `CD-LOCK-02` verbatim as the approved sentence *shape*, and render `[time]` as a **date** in v1 ("…closes Sunday 3 August — lock your application."), since that is all the data can defend (money/scarcity in daylight, §2.5/§2.6). If Rahul wants a wall-clock close ("at 11:59 PM Sunday"), the schema gets a `timestamptz` column first — a small, named schema add, not an assumption. Either way the sentence stays word-for-word except the token. **This is a wording+data decision, not a copy edit — flag before Stage 03 build.**

---

## 4. Copy by flow-v2 stage

Each block: the string ID, the surface, the copy, its lock/draft status, and the PRD requirement it dresses. ✎ draft strings are lifted from the v2 wireframes unless marked `[new-to-voice]`.

### 4.1 Stage 01 — The Identity Spine  `🔴 Tier 1 (auth surface)`

*Implements PRD §5.1 (REQ-IDENT-1..4). The whole point: the applicant never meets a signup screen. Copy must never say "sign up," "create account," or "register" — only "sign in" / "send my code."*

**Sign-in screen (1A)** — `🔴 Tier 1`

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-01-SIGN-01` | Welcome back, whenever you're ready. | ✎ draft (serif) | Serif ceremony line; the door matches how the account was born |
| `CD-01-SIGN-02` | No password. We send a code to the phone or email from your application. | ✎ draft | States the passwordless promise; never asks for a password a person never chose |
| `CD-01-SIGN-03` | Phone · Email | ✎ draft | The two-tab toggle labels; **Email tab is net-new** (WORD-3) |
| `CD-01-SIGN-04` | Send my code | ✎ draft | Primary action |
| `CD-01-SIGN-05` | Code on WhatsApp / SMS · Email code · new | ✎ draft | Channel chips; "new" chip flags the email path honestly |
| `CD-01-SIGN-06` | Applied recently? Your account already exists — it was created the moment you applied. | ✎ draft | Teaches the spine's promise in one line; the anti-signup message |

**Staged applicant home (1B)** — the label chip + one action, both read from `cohort_applications.status`.

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-01-HOME-01` | Applicant | ✎ draft | The role chip (always present for an applicant) |
| `CD-01-HOME-02` | `{cohort_name}` · in review | ✎ draft | Sub-state chip; the four sub-states below |
| `CD-01-HOME-03` | Label per status: **draft** → "applicant · draft" · **submitted (fee unpaid)** → "fee pending" · **app_fee_paid/interview** → "in review" · **decision ready** → "decision ready" | ✎ draft | One label per §5.1 sub-state; QA maps 1:1 to status |
| `CD-01-HOME-04` | Meanwhile — browse the catalogue | ✎ draft | Section header above the non-blocking catalogue. *(Reworded off "browse freely" so the banned-lexicon grep gate — §2.4 — is internally satisfiable; see the whole-word note there.)* |
| `CD-01-HOME-05` | Signed in as +91 98···21 · same account on web and app. | ✎ draft | Masked phone; reinforces one identity across surfaces |

The single next-action button label is derived from status and reuses the stage's own CTA (e.g. "Book my interview," "Complete the ₹400 step"). Do not write a generic "Continue" — the button always names the real next step (§2.2).

> **RAHUL DECISION — WORD-3: the "Email code · new" honesty chip.**
> The email-OTP path is net-new (PRD OTP-1). The flows label it "new" to set expectations. **Recommended default:** ship the "new" chip through the first cohort, then drop it once email-OTP is proven (it reads as beta-flagging otherwise). If Rahul prefers the door to look uniformly finished from day one, drop the "new" chip at launch — the path still works, it just isn't advertised as new. Tie to OTP-1: if email-OTP is deferred, remove `CD-01-SIGN-03`'s Email tab and `CD-01-SIGN-05`'s email chip entirely.

### 4.2 Stage 02 — The Application  `🟢 Tier 3 (Tally-side copy) / 🔴 for the webhook`

*Implements PRD §5.2. The Tally form is external; these are the Tally-builder strings the audit's shortening (REQ-APP-3) touches, plus the essay's reviewer-only framing (REQ-APP-1).*

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-02-FORM-01` | First, the basics. | ✎ draft | Step-1 header; contact captured before any quiz wall |
| `CD-02-FORM-02` | Your answers save as you type. Leave and your draft holds. | ✎ draft | The save-and-resume promise that makes abandon recoverable |
| `CD-02-FORM-03` | Why do you want in? | ✎ draft (serif) | The essay prompt |
| `CD-02-FORM-04` | 2–3 sentences: why you? Write like you talk — a person on the admissions team reads every application. | ✎ draft | REQ-APP-3 rec 7: lighter, honest ask; soft minimum. Replaces the old "One hundred words." heaviness |
| `CD-02-FORM-05` | Read by the admissions team only. It never appears anywhere in the app. | ✎ draft | The essay's reviewer-only contract, stated on the form itself (REQ-APP-1) |
| `CD-02-FORM-06` | Continue to the review fee | ✎ draft | Advances toward the ₹400 gate |
| `CD-02-PAY-01` | ₹400 to enter review | ✎ draft | The gate header; money in daylight |
| `CD-02-PAY-02` | The fee keeps the pile serious. Every application that pays gets a full read and an interview slot held against it. | ✎ draft | Frames the fee as commitment + a promise, not a toll |
| `CD-02-PAY-03` | Application review — Cohort 8 · ₹400 · Applies to this cohort's application only. | ✎ draft | Line-item clarity before Razorpay |
| `CD-02-PAY-04` | Pay ₹400 · Secured by Razorpay · UPI, cards, netbanking | ✎ draft | Payment CTA + trust line |

Progress indicator copy: **"Step {n} of {total}"** (tabular-nums). The quiz block, when present, carries no scored-quiz framing — it reads as part of the application, never "test."

### 4.3 Stage 03 — Install & the Web Path  `🟡 Tier 2`

*Implements PRD §5.3. Install is offered at exactly two value moments; the web app is always the landing.*

**Web-is-the-landing (3A)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-03-WEB-01` | Everything from here to your certificate works right here on the web — nothing needs an install. | ✎ draft | The web-path promise; kills the install wall |
| `CD-03-WEB-02` | Finish my application | ✎ draft | Primary |
| `CD-03-WEB-03` | Prefer the app? It's optional. · Same account, same progress, plus reminders on your lock screen. · Get it | ✎ draft | The one quiet dashed install line; dismiss-once |

**Install nudge — value moment 1, after draft save (3B)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-03-INST-01` | Draft saved | ✎ draft | Eyebrow |
| `CD-03-INST-02` | Get reminded where you left off. | ✎ draft (serif) | Names a benefit tied to the action just taken |
| `CD-03-INST-03` | Install the app and your draft sits on your lock screen — one tap back to step 3, right before the review batch closes. | ✎ draft | The concrete "what do I get right now" |
| `CD-03-INST-04` | Install · keep my place | ✎ draft | Primary |
| `CD-03-INST-05` | I'll finish on the web | ✎ draft | Decline is a first-class button |
| `CD-03-INST-06` | Either way, your draft is held. This card won't ask twice. | ✎ draft | Enforced promise: one ask per application window |

**Install nudge — value moment 2, after acceptance (3C)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-03-ACC-01` | Your cohort lives here. | ✎ draft (serif) | The pitch is now the room itself |
| `CD-03-ACC-02` | Doors-open alerts on Sunday mornings. The assignment unlock at 2:00 PM. Feedback the moment it lands. Twelve weeks run better on your home screen. | ✎ draft | Three concrete room benefits |
| `CD-03-ACC-03` | Session doors — one tap from the notification into the room / The weekly unlock — your cohort starts together, you'll know the second it does / Feedback — when a mentor publishes, you hear about it first | ✎ draft | The three-item value list |
| `CD-03-ACC-04` | Install the app · Continue on the web · The web room is identical — the app adds the knocking on your door. | ✎ draft | Primary + decline + the honest equivalence |

### 4.4 Stage 03 (cont.) — The reminder ladder (Duolingo-cadence, deadline-anchored)

*Implements PRD REQ-INSTALL-3. The exact copy at the exact offsets. Two drop-offs are recovered: form-incomplete, and completed-form-fee-unpaid. Caps: **max 1 touch/day, 4 per application, none 9:30 PM–9:00 AM.** Completion/withdrawal/deadline-pass = instant silence.*

**Form-incomplete ladder**

| ID | Offset | Copy | Status | Note |
|---|---|---|---|---|
| `CD-03-LAD-01` | T+2h | Your application is saved. Two taps to finish. The draft is exactly where you left it. | 🔒 LOCKED (`=CD-LOCK-01`) | First touch, same evening |
| `CD-03-LAD-02` | T+22h | The review batch for this cohort closes at [time] — lock your application. | 🔒 LOCKED (`=CD-LOCK-02`; see WORD-2) | Next evening, local time; `[time]` = date in v1 |
| `CD-03-LAD-03` | T−24h | Step 3 of 6 · about three minutes to finish. | ✎ draft | Names the exact step; **skipped if either earlier touch was opened** |

**Completed-form, fee-not-paid ladder** (driven off REQ-RECON-1's positive marker — the warmest recoverable lead)

| ID | Trigger | Copy | Status | Note |
|---|---|---|---|---|
| `CD-03-LAD-04` | essay present, no captured ₹400 | You're one tap from applying — complete the ₹400 step and your application goes to the admissions team. | ✎ draft `[new-to-voice]` | Fee nudge; obeys the same caps |
| `CD-03-LAD-05` | ₹400 captured, no interview booked | You've paid — now book your interview. Slots are open this week. | ✎ draft `[new-to-voice]` | Closes the scheduling gap (REQ-INT-0 / CRO-2); goes silent the moment REQ-RECON-1 sees the booking |

**Graceful close** (deadline pass — application rolls forward, never deleted; REQ-LOOP-3)

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-03-LAD-06` | Cohort 8 closed — your draft carries to Cohort 9. | ✎ draft | Exactly one close message; the application persists and re-associates |

Ladder register: every message says **where the draft is** and **how short the path back is** — no streaks, no shame, no countdown emojis (§2.3, §2.4). Channels push → WhatsApp (Interakt) → email, same copy, one idempotency ledger so no channel double-fires.

### 4.5 Stage 04 — The Open Loop  `🟡 Tier 2`

*Implements PRD §5.4. Re-entry reorganizes home around one action; personalization is structured-fields-only (no essay text).*

**04-A Draft held (KEEP — the approved screen)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-04-DRAFT-01` | Your draft is safe, exactly where you left it. About three minutes to the finish. | ✎ draft | The held-door reassurance |
| `CD-04-DRAFT-02` | Finish my application | ✎ draft | Primary |
| `CD-04-DRAFT-03` | Remind me tomorrow evening | ✎ draft | Quiet defer |
| `CD-04-DRAFT-04` | Applications for this cohort close [date]. | ✎ draft | Real close (WORD-2) |
| `CD-04-DRAFT-05` | The one prerequisite for any cohort is the passion to learn. | 🔒 LOCKED (`=CD-LOCK-03`) | Foot of screen |

**04-B Words in, fee pending (revised — no essay text)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-04-FEE-01` | Aarav, your application is written. | ✎ draft (serif) | Leads with **name**, not essay |
| `CD-04-FEE-02` | `{craft}` · `{cohort}` · `{city}` · `{experience_band}` | ✎ draft | Structured-fact chips (the safe personalization) |
| `CD-04-FEE-03` | Goal you picked: **`{quiz_goal}`**. The ₹400 step puts your application in front of the admissions team. | ✎ draft | Uses the quiz-picked goal — a deliberate choice, never freeform text |
| `CD-04-FEE-04` | Complete the ₹400 step | ✎ draft | Primary |
| `CD-04-FEE-05` | Changed your mind? Withdraw quietly — no calls, no guilt. | ✎ draft | The graceful-exit line (register §2.3) |

**04-C The two kept lines (lock screen)** — renders `CD-LOCK-01` and `CD-LOCK-02` verbatim as push/notification copy. No other copy on this screen.

### 4.6 Stage 05 — The Interview  `🟡 Tier 2` (+ `🔴` modality webhook)

*Implements PRD §5.5. The interviewer is admissions, never mentor/counselor; real first name, no bio, a selectivity line. The student chooses Meet or phone; the card honors it. "Free" appears nowhere.*

**5A Book the conversation (on the ₹400 success screen — REQ-INT-0)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-05-BOOK-01` | You're in review | ✎ draft | Eyebrow |
| `CD-05-BOOK-02` | Now book your conversation. | ✎ draft (serif) | The one-motion booking |
| `CD-05-BOOK-03` | Fifteen minutes with the admissions team about your work and your plans. A conversation, not an exam. | ✎ draft | De-risks the interview; "admissions team," never mentor |
| `CD-05-BOOK-04` | Google Meet · Phone call | ✎ draft | Modality toggle (maps to Calendly locations) |
| `CD-05-BOOK-05` | Your choice — both count the same. Pick what's comfortable. | ✎ draft | Removes modality anxiety |
| `CD-05-BOOK-06` | One reschedule available if plans change. Confirmation on WhatsApp. | ✎ draft | **Reschedule guardrail — note "free" is absent by design** (§2.4) |

**5B/5C Appointment card — Meet and phone variants**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-05-INT-01` | Arjun — Admissions Interviewer | ✎ draft | Real first name + title (WORD-1); no bio |
| `CD-05-INT-02` | Accepts about 24% of the applicants he interviews | ✎ draft | Selectivity line — the credibility a bio would give (perform-well FOMO). Phrasing varies naturally per interviewer ("about 1 in 4…" is an allowed equivalent) |
| `CD-05-INT-03` | in 2 days 4 hours · Google Meet | ✎ draft | Meet variant countdown + modality |
| `CD-05-INT-04` | The Meet link lands right here 15 minutes before. Camera on if you can — it's friendlier. | ✎ draft | Meet choreography; link at T−15 |
| `CD-05-INT-05` | Meera calls **+91 98···21** at 6:30 sharp. Keep the line open — the call shows as LevelUp Admissions. | ✎ draft | Phone variant; who calls, when, caller-ID. No link |
| `CD-05-INT-06` | Add to calendar · Reschedule · one available | ✎ draft | Actions; **no "free," no charge copy near reschedule** |
| `CD-05-INT-07` | Wrong number on file? Fix it here before Thursday. | ✎ draft (phone variant) | One-tap fix for the nervous phone chooser |

**5D Prep sheet + the batch ledger (honest FOMO — REQ-INT-3)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-05-PREP-01` | Three things you'll talk about. | ✎ draft (serif) | Prep header |
| `CD-05-PREP-02` | Your why. The admissions team has read your application. Be ready to go one layer deeper. | ✎ draft | Item 1 |
| `CD-05-PREP-03` | Anything you've made. A link is enough. Unfinished is fine — half-made things are welcome here. | ✎ draft | Item 2 — **the softened line** (replaces "untouched is the only wrong answer," §2.4) |
| `CD-05-PREP-04` | Your twelve weeks. Sunday mornings, Saturday evenings — what does showing up look like for you? | ✎ draft | Item 3 |
| `CD-05-PREP-05` | Recent review batches · Batch 12 — 41 interviewed · 11 admitted | ✎ draft | The batch ledger — real numbers only; **hides if the source is unavailable** (REQ-INT-3) |
| `CD-05-PREP-06` | Yours: Batch 13, decided within 48 hours of your conversation. | ✎ draft | The promise, on the screen |
| `CD-05-PREP-07` | No trick questions. The one prerequisite for any cohort is the passion to learn. | 🔒 LOCKED tail (`=CD-LOCK-03`) | Prep foot |

**No-show copy** (warm, uses the one reschedule — never GrowthX's "no refunds for no-shows" register)

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-05-NS-01` | Life happens. Pick a new slot — this uses your one reschedule. | ✎ draft `[new-to-voice]` | First miss; warm, not punitive |
| `CD-05-NS-02` | We'll reach out by phone to find a time that works. | ✎ draft `[new-to-voice]` | Second miss → human outreach (no dead-end) |

> **RAHUL DECISION — WORD-1: the interviewer's student-facing title.** *(Restates PRD TITLE-1 as its wording form.)*
> Options: **"Admissions Interviewer"** (person-level, honest) · "Selection Panel" (collective, higher stakes, hides the human) · "Admissions Team" (warm, institutional, vague). **Recommended default: "Admissions Interviewer"** for the person ("Arjun · Admissions Interviewer"), with **"the admissions team"** as the collective noun in prose and **"the admissions panel"** where a decision is being described (the letter, §4.7). Never "counselor," never "mentor." All of §4.5–§4.7's title strings inherit this pick.

### 4.7 Stage 06 — The Decision  `🟡 Tier 2` (public page's whitelist = `🔴`)

*Implements PRD §5.6. The sealed reveal, the card, the shareable artifact, the two post-decision flows, the public page. Personalization: structured fields only, no seat number.*

**6A The sealed notice**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-SEAL-01` | Your admission decision is ready. | ✎ draft | The notification body — **carries no verdict** (REQ-DEC-1) |
| `CD-06-SEAL-02` | Your decision is ready. | 🔒 LOCKED (`=CD-LOCK-04` beat 1) | On the sealed screen (serif) |
| `CD-06-SEAL-03` | Sealed until you open it. Nobody sees it before you — not even in the notification. | ✎ draft | The seal promise |
| `CD-06-SEAL-04` | Open your decision | 🔒 LOCKED (`=CD-LOCK-04` beat 2) | The reveal CTA |

**Reveal animation copy (admitted path — storyboard F1–F5)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-REV-01` | `{name}` — | ✎ draft | F3: name rises |
| `CD-06-REV-02` | you're in. | ✎ draft | F3: the verdict, larger. **Reduced motion: verdict is never gated behind animation** — the crossfade still shows it |
| `CD-06-REV-03` | `{program_name}` · `{cohort}` | ✎ draft | F4: program lockup |

Waitlisted/rejected use the same staging, quieter, straight to a kind letter (no rule sweep). See `CD-06-LTR-05/06`.

**6B The admission letter (no essay text)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-LTR-01` | Aarav, you're in. | ✎ draft (serif) | Leads with name + verdict |
| `CD-06-LTR-02` | `{program_name}` · Cohort 8 · begins `{day_one_date}`. | ✎ draft | The facts |
| `CD-06-LTR-03` | Two years behind wedding cameras in Kochi. A goal you set yourself: **`{quiz_goal}`**. The panel read your application twice, met you on Thursday, and wants you in this room. | ✎ draft | **Structured-fields personalization** — experience band, city, quiz goal, interview date. Not one word of essay |
| `CD-06-LTR-04` | The admissions panel · decided `{date}` · Batch 13 | ✎ draft | Signature block |
| `CD-06-LTR-05` | *(waitlist)* You're on the waitlist for Cohort 8 — a strong application the panel wants to keep in reach. If a seat opens, you're first, and your acceptance carries to Cohort 9 either way. | ✎ draft `[new-to-voice]` | Kind, named next step; ties to lapsed-≠-lost (CRO #8) |
| `CD-06-LTR-06` | *(not admitted)* Not this cohort — `{rejection_reason}`. This isn't the end of the road; here's what would make the next application stronger, and the door for Cohort 9. | ✎ draft `[new-to-voice]` | Honest reason (renders `rejection_reason`), a paved road, never mocking |

**6C The acceptance card (no seat number, no essay)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-CARD-01` | Admitted | ✎ draft | The eyebrow (tracked-out) |
| `CD-06-CARD-02` | `{full_name}` · `{program_name}` · Cohort 8 · Class of Nov '26 | ✎ draft | Name, full program, cohort + class year |
| `CD-06-CARD-03` | One of 30 · from 1,142 applications | ✎ draft | **The accept-rate line — does the status work the seat number used to, leaks no fill state** (§2.6). Real aggregates only |
| `CD-06-CARD-04` | Admitted 24 · 07 · 2026 · Kochi | ✎ draft | Admit date + city |
| `CD-06-CARD-05` | Share the video to your story · Download card · Copy link | ✎ draft | Actions |
| `CD-06-CARD-06` | Share it or don't — your seat doesn't care. | ✎ draft | The no-pressure line (calm-luxury; anti-hype) |

**Share moment**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-SHR-01` | Your admission film · 7s · with sound off-safe | ✎ draft | Describes the artifact (PNG+WebM in v1; server mp4 fast-follow, RENDER-1) |
| `CD-06-SHR-02` | Admitted to the Breakthrough Filmmakers' Program · Cohort 8. | ✎ draft | **Prefilled, editable share caption** |
| `CD-06-SHR-03` | The link in your bio card leads to your public admission page. | ✎ draft | Points at the recipient page |

**6E Claim my seat (context before checkout — money in daylight)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-CLM-01` | Claim my seat | 🔒 LOCKED (`=CD-LOCK-04` beat 3) | Primary |
| `CD-06-CLM-02` | Your seat is held until Saturday 6:00 PM. | ✎ draft | The honest countdown copy (SEAT-1: this ships v1; automation is fast-follow) |
| `CD-06-CLM-03` | Confirm with **₹8,000** — part of your program fee, not an extra. | ✎ draft | The ₹8k framed as part of tuition (§2.5) |
| `CD-06-CLM-04` | The moment it clears, **your cohort room unlocks** — everything you saw behind the veil. | ✎ draft | What confirming buys |
| `CD-06-CLM-05` | After the window, the seat is offered to the waitlist. Miss it by a little? There's a short grace period — talk to us first. | ✎ draft | The grace policy; human, not automated-punitive |
| `CD-06-CLM-06` | Program fee · Cohort 8 · ₹40,000 / Today · ₹8,000 / Remaining ₹32,000 · on your plan, dates in writing | ✎ draft | The full arithmetic **before** Razorpay opens |
| `CD-06-CLM-07` | Continue to payment — ₹8,000 · Read the enrollment details first | ✎ draft | Primary + the read-first path |

**6F Confirmed state**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-CNF-01` | Seat confirmed. The room is yours. | ✎ draft (serif) | The receipt is the door opening |
| `CD-06-CNF-02` | `{program_name}` · Cohort 8 · Day One, `{day_one_date}`. | ✎ draft | The facts |
| `CD-06-CNF-03` | Unlocking now: This week · your pre-start checklist / Sessions · the 12-week calendar / Community · introduce yourself / Receipt and fee plan — in your email and under You | ✎ draft | What just opened |
| `CD-06-CNF-04` | Enter your cohort room | ✎ draft | Primary → Stage 07 unlock |
| `CD-06-CNF-05` | Balance ₹32,000 · due Sun 10 Aug · the plan flexes, the dates stay in writing | ✎ draft | Balance in daylight |

**6G Enrollment details (Flow B)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-ENR-01` | ₹40,000, in three parts. | ✎ draft | Header; no surprises |
| `CD-06-ENR-02` | Application · paid 12 Jul · ₹400 ✓ / Seat confirmation · this week · ₹8,000 / Balance · due Sun 10 Aug · ₹32,000 | ✎ draft | The three parts with dates |
| `CD-06-ENR-03` | Need the balance split in two? Say so — the schedule flexes, the dates stay in writing. | ✎ draft | Flexibility, on the record |
| `CD-06-ENR-04` | The twelve weeks: Learning sessions · Sundays 11:00 AM · live / Feedback sessions · Saturdays 5:00 PM / One assignment a week · recordings within 24h | ✎ draft | Cadence |
| `CD-06-ENR-05` | What's expected: Attendance 85%+ for the certificate · missed weeks recoverable · reminders keep office hours · doors never lock mid-class | ✎ draft | Expectations (Rule 03/04) |

**6H Public admission page** — `🔴 Tier 1 (data whitelist)`

*The copy here is Tier-1 because it defines the field whitelist. It renders ONLY: card, verified admit line, three program sentences, faculty names, one door. It NEVER shows contact, fees, interview data, or funnel state (REQ-DEC-6 acceptance).*

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-06-PUB-01` | Admitted `{date}` · one of 30, from 1,142 applications · verified by LevelUp | ✎ draft | The verified admit line |
| `CD-06-PUB-02` | Twelve weeks, live. Sunday learning sessions, Saturday feedback, one film by the finish. Taught by working filmmakers, capped at 30. | ✎ draft | Three program sentences (SKU-specific; academic base underneath) |
| `CD-06-PUB-03` | Faculty — Priya N. · Ravi B. | ✎ draft | Names only |
| `CD-06-PUB-04` | **Applications for Cohort 9 open in September.** · Get notified when they open | ✎ draft | The one tasteful door (the acquisition loop; tracked per CRO #13 fast-follow) |

### 4.8 Stage 07 — The Locked Future  `🟡 Tier 2`

*Implements PRD §5.7. Seat numbers gone everywhere; the real room shown veiled; a designed unlock; pre-start induction by people, not numerals.*

**7A Locked room**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-07-LCK-01` | Locked · opens on confirmation | ✎ draft | The per-module lock chip |
| `CD-07-LCK-02` | Claim my seat — unlock the room | ✎ draft | Primary |
| `CD-07-LCK-03` | Seat held until Saturday 6:00 PM | ✎ draft | Honest countdown — **no seat number, no fill counter anywhere** (§2.4) |

**7B Unlock moment**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-07-UNL-01` | Unlocked | ✎ draft | Lock chip flips |
| `CD-07-UNL-02` | Welcome to Cohort 8, Aarav. | ✎ draft | The room greets by name (serif-adjacent) |

**7C Pre-start induction**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-07-PRE-01` | Ready for Day One | ✎ draft | Readiness is the headline, the timer a line |
| `CD-07-PRE-02` | `{n} days to Day One` | ✎ draft | Countdown (IST-correct); never "x of 30" |
| `CD-07-PRE-03` | Checklist items: Introduce yourself to the room / Sync the 12-week calendar to your phone / Watch the pre-read — 22 min, sets Week 1's vocabulary / Gear check — your phone camera is enough; here's the settings sheet / Say hello to your feedback pod — 5 people | ✎ draft | Ten small dones beat one big wait |
| `CD-07-PRE-04` | The room is filling · Ananya from Kochi joined today · says she cuts on her phone | ✎ draft | **Roll call = people with a detail, no numeral** (fixes the fill-state leak while keeping warmth) |
| `CD-07-PRE-05` | Day One · Sun 17 Aug, 11:00 AM · doors 10:45 | ✎ draft | The moment, dated |

### 4.9 Stage 08 — The Cohort Room  `🟡 Tier 2` (backbone `🔴`)

*Implements PRD §5.8. Six surfaces. **All room strings are written in the academic base and skinned per SKU by `vocab` (§5).** A `{vocab.*}` token below resolves at render — never hardcode "cut"/"screening".*

**8A Room home — today/this-week spine**

| ID | Copy (academic base) | Status | Note |
|---|---|---|---|
| `CD-08-HOME-01` | Week 5 of 12 · attendance 4/4 | ✎ draft | The spine; academic, never renamed |
| `CD-08-HOME-02` | Today · doors 10:45 | ✎ draft | Leads with the next timed thing |
| `CD-08-HOME-03` | `{vocab.session_noun}` · 11:00 AM · Priya N. | ✎ draft (vocab) | "Learning session" (base) / "build session" (AI) |
| `CD-08-HOME-04` | 24 already inside | ✎ draft | **Avatar-count of who's in — allowed (not a fill counter; it's live presence in a session)**, but never "24 of 30" |
| `CD-08-HOME-05` | Join today's `{vocab.session_noun}` | ✎ draft (vocab) | Primary |
| `CD-08-HOME-06` | Tabs: Today · Sessions · `{vocab.tab_assignments}` · Community · You | ✎ draft (vocab) | "Assignments" (base) / "Builds" (AI) |

**8B Session as a staged moment**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-08-SES-01` | 11:00 AM – 12:30 PM IST · live on Zoom | ✎ draft | "live on Zoom" is a **true, allowed** string here (§2.4 note) |
| `CD-08-SES-02` | Priya N. — faculty · edits features; teaches rhythm weeks 5–7 | ✎ draft | Faculty card |
| `CD-08-SES-03` | 24 of your cohort inside · doors open | ✎ draft | Presence, not fill |
| `CD-08-SES-04` | Join · begins in 12:41 | ✎ draft | Countdown resolves into a join button |
| `CD-08-SES-05` | How the hour runs | ✎ draft | Run-of-show header (`session_agenda`, new field) |
| `CD-08-SES-06` | Can't make it? The recording lands on this page within 24 hours — and it counts toward recovery. | ✎ draft | Keeps the recording promise; reframes as recovery (CRO-3) |

**8C Assignment (timed unlock)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-08-ASG-01` | just unlocked · 2:00 PM · due Sat 10:00 AM | ✎ draft | Cohort-wide timed unlock |
| `CD-08-ASG-02` | Drop your `{vocab.submission_noun}` — file, link, or text · up to 2GB · private to mentors until Saturday | ✎ draft (vocab) | "cut"/"post"/"build" |
| `CD-08-ASG-03` | Status ladder: open · submitted · under review · feedback in | ✎ draft | Matches DB statuses 1:1 |
| `CD-08-ASG-04` | Late lands as "late" on your record, not in a void. Feedback still comes. | ✎ draft | Late is "late" (amber), never a void (§2.4 register) |
| `CD-08-ASG-05` | `{vocab.work_verb}` `{vocab.submission_noun}` `{n}` | ✎ draft (vocab) | "Submit assignment 5" / "Publish post 5" / "Ship build 5" |

**8D Recordings shelf**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-08-REC-01` | Continue watching | ✎ draft | Resume rail header |
| `CD-08-REC-02` | 32:14 left · resume | ✎ draft | Resume position (`cohort_recording_progress`, new) |
| `CD-08-REC-03` | Missed Week 7? Watching its recording counts toward recovery — see your record. | ✎ draft | Recovery framing, not a substitute for attending |
| `CD-08-REC-04` | *(iOS, FairPlay gap)* This recording opens on the web — tap to watch in your browser. | ✎ draft `[new-to-voice]` | Graceful iOS degradation (PRD §4.4, Open Q5); **WORD-4** |

**8E The record (+ academic standing)**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-08-RCD-01` | ✓ present · R recovered · × missed | ✎ draft | The attendance legend — "Recovered" distinct from "present" |
| `CD-08-RCD-02` | Attendance · 9 of 10 · 90% / Certificate threshold · 85% | ✎ draft | Real numbers vs the gate |
| `CD-08-RCD-03` | Missed Week 7? Watch the recording and post a 3-line recap within 6 days. It lands on your record as **Recovered** — distinct from present, and it counts. | ✎ draft | The recovery path |
| `CD-08-RCD-04` | Recover Week 7 | ✎ draft | Primary; names the exact week |
| `CD-08-RCD-05` | Academic standing: **Distinction** / **Merit** / **Completion** | ✎ draft | The standing labels (CRO-3 / STANDING-1) — **WORD-5**; registrar words, no gamification |

**8F Picks, wins, resources**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-08-WIN-01` | mentor's pick | ✎ draft | The Saturday pick chip |
| `CD-08-WIN-02` | Fatima booked her first paid edit · 12 congratulations · add yours | ✎ draft | Wins rail (rides `post_type='wins'`); "congratulations," never "likes" |
| `CD-08-WIN-03` | See all Week 5 submissions | ✎ draft (vocab-aware) | → the dailies wall (fast-follow #12) |

> **RAHUL DECISION — WORD-4: iOS recordings copy when FairPlay isn't supported.** *(The wording side of PRD Open Q5.)*
> Until VdoCipher FairPlay plays in the iOS WKWebView, recordings must degrade gracefully. Three copy postures: (a) **"opens on the web"** link-out (`CD-08-REC-04`, recommended — honest, keeps the promise), (b) "watch on web" as a quieter inline note, (c) hide the row on iOS (worst — silently breaks the recording promise). **Recommended default: (a).** Tie the final string to the engineering choice in Open Q5.

> **RAHUL DECISION — WORD-5: the academic-standing labels.** *(The wording side of PRD STANDING-1.)*
> The tiers are **Distinction / Merit / Completion** (`CD-08-RCD-05`), registrar language, no gamification. **Recommended default:** keep these three words; they read as a transcript, not a game (§2.4). The *cutoffs* are STANDING-1's job (a numbers decision, PRD §5.8); the *words* are this. If STANDING-1 is declined (gate-only in v1), `CD-08-RCD-05` renders only "Certificate eligibility · met/not yet" and the tier words don't ship.

### 4.10 Stage 09 — The Room's Commons  `🟡 Tier 2` (backbone `🔴`)

*Implements PRD §5.9. In-room community, cohort-scoped, structurally separate from the global commons.*

**9A Channels**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-09-CH-01` | Announcements · mentors post, everyone reads | ✎ draft | Append-only, mentor/host-posted (RLS-enforced) |
| `CD-09-CH-02` | This Week · auto-thread per week | ✎ draft | Auto-minted per week (the week's campfire) |
| `CD-09-CH-03` | Assignments Help | ✎ draft | Standing channel (vocab-aware: "Builds Help") |
| `CD-09-CH-04` | Wins | ✎ draft | Rides existing `post_type='wins'` |
| `CD-09-CH-05` | General · chai, gear talk, Sunday plans | ✎ draft | Standing channel |
| `CD-09-CH-06` | `{vocab.niche_channels}` · cohort-specific channel · from config | ✎ draft (vocab) | e.g. "Gear & Rigs" / "Hooks & Formats" / "Agents & Automations" |
| `CD-09-CH-07` | Priya is in the room · replies Tue & Sat evenings | ✎ draft | **Honest mentor presence — an office-hours line, not a fake green dot** (§2.7) |
| `CD-09-CH-08` | This commons belongs to Cohort 8. The app-wide community lives in its own tab — nothing crosses. | ✎ draft | The separation, stated to the member |

**9B Thread**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-09-TH-01` | mentor | ✎ draft | The distinct mentor-reply chip |
| `CD-09-TH-02` | 12 found this helpful | ✎ draft | The helped-mark (quiet counter; the only "currency," shared DNA with the global commons' `helped`) |
| `CD-09-TH-03` | Reply to `{name}`… | ✎ draft | Composer placeholder |

**9C Separation panel (internal-facing copy for the "why two communities" explainer, if surfaced)** — renders the boundary: scope, crossing (a win re-shared explicitly, one tap, never by default), identity (one profile, role chips per room), moderation (reports route to admins with the room named). Source strings verbatim from v2 Stage 09-C.

### 4.11 Stage 10 — Per-SKU vocabulary — see the term table (§5)

*Stage 10 has no unique screen copy beyond the room strings it re-skins; its deliverable is the config table in §5.*

### 4.12 Stage 11 — The Mentor's Desk  `🟡 Tier 2`

*Implements PRD §5.11. One Saturday surface; oral-vs-published delivery toggle; students are names and work, never numbers.*

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-11-DESK-01` | Week 5 · Saturday desk · 21 submitted · 6 missing · 3 excused | ✎ draft | Header; counts of submissions, not student numbers |
| `CD-11-DESK-02` | Deliver in session · Publish to student | ✎ draft | The per-student oral-vs-published toggle |
| `CD-11-DESK-03` | oral · notes stay private | ✎ draft | When "deliver in session" is chosen |
| `CD-11-DESK-04` | screen on Saturday | ✎ draft (vocab-aware) | The pick chip |
| `CD-11-DESK-05` | no submission · missed Sunday · recovery open till Tue | ✎ draft | Names the recovery window |
| `CD-11-DESK-06` | Mark attendance from Zoom log · Publish all written feedback | ✎ draft | The two mentor actions |

### 4.13 Stage 12 — The Finish  `🟡 Tier 2`

*Implements PRD §5.12. Transcript → verifiable certificate → alumni room (never deleted).*

**12A Transcript**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-12-TR-01` | Twelve weeks, on the record. | ✎ draft (serif) | Header |
| `CD-12-TR-02` | Attendance · 11 of 12 · 92% / Recovered weeks · 1 / Assignments · 12 of 12 / Mentor grade · A− / Certificate eligibility · met · ≥85% | ✎ draft | Real tracked numbers |
| `CD-12-TR-03` | *(ineligible)* `{pct}`% attendance · `{threshold}`% needed. Your recordings shelf is the make-up path — recover the weeks you missed. | ✎ draft `[new-to-voice]` | Honest, no shame register (REQ-FINISH-1 acceptance) |
| `CD-12-TR-04` | Claim my certificate · Download my transcript · PDF | ✎ draft | Actions |

**12B Certificate**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-12-CE-01` | Certificate of Completion · `{full_name}` · `{program_name}` · Cohort 8 · Nov 2026 | ✎ draft | The credential |
| `CD-12-CE-02` | The verify link shows your transcript — attendance, assignments, grade — to anyone you send it to. Revocable by you, any time. | ✎ draft | The verify promise |
| `CD-12-CE-03` | Signed by your mentors, not a printer. | ✎ draft | The credential's differentiator |

**12C Alumni room**

| ID | Copy | Status | Note |
|---|---|---|---|
| `CD-12-AL-01` | This room stays open. You keep it. | 🔒 semi-locked (v2-approved framing) | The alumni banner (REQ-FINISH-2 names this line) |
| `CD-12-AL-02` | Every recording — all 24 sessions, forever / Your work — 12 assignments, 2 screening picks, your final cut / The roster — 30 people who watched your worst cut and your best one | ✎ draft (vocab-aware) | What's kept (nothing deleted, R-D7) |
| `CD-12-AL-03` | **Know someone who should be in Cohort 9?** Your referral walks their application to the front of the review pile. · Refer someone | ✎ draft | The referral affordance (one honest option) |

---

## 5. The per-SKU vocabulary table (config, not code)

*Implements PRD REQ-VOCAB-1/2. This is the canonical mapping: the `vocab` jsonb key on `cohort_room_configs`. Labels only — routes, tables, statuses, notifications, and the mentor desk speak the academic base internally. Any unset key falls back to the base. A term ships only if practitioners actually say it (the editorial cringe test: `cut` ✓, `blockbuster` ✗). Verbatim from v2 Stage 10.*

| `vocab` key | Academic base (fallback) | Breakthrough Filmmakers | Creator Academy | AI Generalist |
|---|---|---|---|---|
| `member_noun` | student | filmmaker | creator | builder |
| `session_noun` | learning session | learning session | live session | build session |
| `feedback_session` | feedback session | Saturday screening | Saturday review | ship review |
| `submission_noun` | submission | cut | post | build |
| `work_verb` | submit | submit your cut | publish | ship |
| `recordings_label` | Recordings | Screenings | Replays | Replays |
| `finale_label` | Closing session | Final screening | Creator showcase | Demo Day |
| `tagline` | — | Twelve weeks. One film. | Twelve weeks. A body of work. | Three months. Three builds. |
| `niche_channels` | (none) | Gear & Rigs · Locations | Hooks & Formats · Brand Deals | Agents & Automations · Show Your Stack |
| `tab_assignments` | Assignments | Assignments | Assignments | Builds |

**Guardrails (binding):** vocabulary changes **labels, never structure**. Weeks, attendance, the record, and the transcript are **never renamed** — the registrar always speaks plainly (§2.1). A mentor grading three cohorts sees each room's words over one system. The AI cohort's terms are mined from the live `/ai-cohort` marketing page (`public/ai-cohort/index.html`) so the room keeps the promise the page sells — builders, builds, ship, build sessions, Demo Day.

> **RAHUL DECISION — WORD-6: the AI cohort's program name.**
> The flows render it as **"The AI Generalist Program"** (tagline "Three months. Three builds."). This is the one program name not yet live (the SKU is unlaunched). **Recommended default:** keep "The AI Generalist Program" pending Rahul's confirmation — but flag it, because unlike BFP and Creator Academy this name is a proposal, not an existing brand. If Rahul has a different name (or the `/ai-cohort` page uses another), the config `tagline`/nameplate and `CD-06-CARD-02`-style strings inherit it. Verify against the `/ai-cohort` page and Rahul's memory (`reference_latest_ai_models` / the marketing-site note) before locking.

---

## 6. Errors, empty states & loading — in one voice

*The flows left these blank; they are written here `[new-to-voice]` to §2. The rule: an error states what happened and the one thing to do next; it never blames the user, never exposes a stack, never uses "oops." Loading is quiet. Empty is an invitation, not a void.*

### 6.1 Errors

| ID | Situation | Copy | Note |
|---|---|---|---|
| `CD-ERR-01` | OTP code wrong/expired | That code didn't work — it may have expired. Send a fresh one? | `🔴` auth surface; never reveals whether the identifier exists |
| `CD-ERR-02` | OTP send failed (network) | We couldn't send your code just now. Check your connection and try again. | No blame |
| `CD-ERR-03` | Payment failed / cancelled | Your payment didn't go through — nothing was charged. Try again when you're ready; your seat is still held until `{time}`. | `🔴` payments; reassures no double-charge, restates the held window |
| `CD-ERR-04` | Payment succeeded, verification pending | Payment received — we're confirming it now. This can take a moment; you'll see your room unlock the second it clears. | Never says "failed" during the verify window |
| `CD-ERR-05` | pending_claim collision at sign-in | This phone is linked to another account. Verify the email on your application and we'll connect them — one more code, then you're in. | `🔴` the claim step (REQ-IDENT-2); a claim, never a merge, never a support ticket |
| `CD-ERR-06` | Room access denied (not a member) | This room belongs to a cohort you're not in. Your rooms are under My Cohorts. | `🔴` access-control; never leaks the target room's contents |
| `CD-ERR-07` | Submission upload too large / failed | That file didn't upload — it may be over 2GB, or the connection dropped. A link works too. | Offers the alternative |
| `CD-ERR-08` | Generic server error | Something went wrong on our end — not yours. We're on it; try again in a moment. | Takes the blame; no stack, no "oops" |
| `CD-ERR-09` | Deadline passed on an action | This batch has closed — but your draft carries forward. We'll place it in the next cohort. | Ties to `CD-03-LAD-06`; never a dead end |

### 6.2 Empty states

| ID | Surface | Copy | Note |
|---|---|---|---|
| `CD-EMP-01` | Recordings shelf, none yet | Recordings land here within 24 hours of each session. Nothing to catch up on yet — you're current. | Invitation, not void; reinforces the 24h promise |
| `CD-EMP-02` | Community channel, no posts | Quiet in here for now. Say the first thing — a question, a work-in-progress, a hello. | Prompts the first post |
| `CD-EMP-03` | Assignments, none unlocked yet | Your first `{vocab.submission_noun}` unlocks after Week 1's session. It'll appear here the moment it does. | vocab-aware |
| `CD-EMP-04` | Record, pre-Day-One | Your record fills in from Day One — attendance, work, and your standing, week by week. | Sets expectation |
| `CD-EMP-05` | My Cohorts, applicant not yet enrolled | You're in review — your room appears here the day you're accepted and confirmed. | Bridges applicant → member |
| `CD-EMP-06` | Wins channel, none | No wins posted this week yet. Booked a gig, shipped a thing, hit a milestone? Post it — the room celebrates. | vocab-neutral; "celebrates," not "likes" |

### 6.3 Loading & progress

| ID | Surface | Copy | Note |
|---|---|---|---|
| `CD-LOAD-01` | Generic surface load | *(no text — skeletons only)* | Calm-luxury: loading is silent; use skeletons, never a spinner-with-message |
| `CD-LOAD-02` | Decision video rendering (rare fallback) | Rendering your admission film… a few seconds. | Only if the on-device WebM is producing at tap-time (REQ-DEC-3 fallback) |
| `CD-LOAD-03` | Payment sheet opening | Opening secure payment… | Brief; Razorpay owns the sheet after |
| `CD-LOAD-04` | Reconciliation-derived stage refreshing | *(no text — the home just re-renders with the new stage)* | REQ-RECON-1 updates silently; never surface "reconciling" to the user |

### 6.4 Toasts / confirmations

| ID | Situation | Copy | Note |
|---|---|---|---|
| `CD-TST-01` | Draft saved | Draft saved — right where you left it. | Echoes `CD-LOCK-01`'s language |
| `CD-TST-02` | Interview booked | Booked. `{modality}` on `{day}` — added to your calendar. | Renders the chosen modality (never assumes) |
| `CD-TST-03` | Submission received | `{vocab.submission_noun}` in — private to mentors until Saturday. | vocab-aware |
| `CD-TST-04` | Feedback published (to student) | Your mentor left feedback on Week `{n}`. | Ties to the publish path |
| `CD-TST-05` | Reschedule used | Rescheduled. That was your one — the new time is on your calendar. | States the allowance spent; **no "free"** |
| `CD-TST-06` | Public page unpublished | Your admission page is private again — the link now leads nowhere. | Confirms the reversal |

---

## 7. Consolidated RAHUL DECISIONS on wording

| ID | Wording decision | Recommended default | Ties to |
|---|---|---|---|
| **WORD-1** | The interviewer's student-facing title | "Admissions Interviewer" (person) / "the admissions team" (prose) / "the admissions panel" (decisions). Never counselor/mentor. | PRD TITLE-1; §4.5–§4.7 |
| **WORD-2** | `CD-LOCK-02` "closes at [time]" vs. the date-only data | Keep the sentence verbatim; render `[time]` as a **date** in v1 (data can't defend a wall-clock time). `timestamptz` column first if Rahul wants "at 9 PM." | PRD REQ-INSTALL-3; §3 |
| **WORD-3** | The "Email code · new" honesty chip | Ship the "new" chip through cohort 1, then drop it. Tie to OTP-1; if email-OTP is deferred, remove the Email tab. | PRD OTP-1; §4.1 |
| **WORD-4** | iOS recordings copy when FairPlay is unsupported | "This recording opens on the web" link-out (`CD-08-REC-04`) — honest, keeps the promise. | PRD Open Q5; §4.9 |
| **WORD-5** | The academic-standing labels | Distinction / Merit / Completion (registrar words, no gamification). If STANDING-1 is gate-only, the tier words don't ship. | PRD STANDING-1; §4.9 |
| **WORD-6** | The AI cohort's program name | "The AI Generalist Program" pending confirmation — it's a proposal, not a live brand; verify against `/ai-cohort` + Rahul memory. | PRD REQ-VOCAB-2; §5 |

---

*End of copy deck. This document dresses the scope fixed in `01-PRD.md`; it does not change it. The four 🔒 LOCKED lines (§3) render verbatim; the banned lexicon (§2.4) is grep-checkable at the QA gate; the per-SKU term table (§5) is the single source for room labels. Nothing here overrides a PRD RAHUL DECISION — where a decision has a wording dimension, this deck restates it as a WORD-N and defers the scope/number to the PRD. Nothing ships without Rahul's written sign-off; the payment pipeline copy on the staged-checkout surfaces stays byte-for-byte untouched.*
