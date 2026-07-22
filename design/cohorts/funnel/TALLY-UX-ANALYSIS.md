# Tally Application Funnel: UX Analysis

Audit date: 2026-07-16 (~22:00 IST). Source: Tally API (`api.tally.so`, read-only GET), live production forms.
Scope: the live-cohort and Forge application forms. Recommendation frame: **optimize within Tally, do not replace it.**

All submission counts are lifetime unless a window is stated. "Today" and "7d" are IST; today is a partial day.

---

## 1. Form inventory: the live application forms

The Tally account holds 904 forms; the vast majority are per-episode feedback and assignment forms. Stripping those out, the actual **application / lead-capture funnel** runs on the forms below. Two product lines feed the paid funnel: **Live cohorts** (₹400 application fee) and **Forge** (₹600 to ₹900 application fee). Everything else (masterclasses, workshops, StarDa, Qura) is a separate business.

`Qs` below is the raw questions-array count and **includes hidden attribution fields** (each form carries 4 to 8 hidden UTM/click-id fields). Answerable question counts are lower (VE = 19 answerable across 22 pages).

### Live cohort forms (₹400 funnel)

| Product / SKU | Form name | Form id | Qs | All | Completed | Partial | Compl. % | State |
|---|---|---|---:|---:|---:|---:|---:|---|
| Live Video Editing (VE) | `VE \| EXP ( Meta Ads )` | `nWLkyk` | 25 | 38,176 | 9,794 | 28,382 | **25.7%** | **Active, main** |
| Live BFP | `BFP \| Exp ( Meta Ads )` | `npvj5y` | 22 | 18,992 | 5,131 | 13,861 | 27.0% | Active |
| Live Creators (L3C) | `Creators <> Meta Ads` | `81dRPA` | 29 | 3,863 | 863 | 3,000 | 22.3% | Active |
| Live BFP (A/B) | `BFP \| Main Form ( A/B )` | `3Ng0WO` | 18 | 3,014 | 1,340 | 44.5% | 1,674 | Variant |
| Live BFP (top-funnel) | `BFP \| Free Masterclass` | `gDQ1Dl` | 7 | 344 | 312 | 32 | 90.7% | Reg form |

### Forge forms (₹600 to ₹900 funnel)

| Product / SKU | Form name | Form id | Qs | All | Completed | Partial | Compl. % | State |
|---|---|---|---:|---:|---:|---:|---:|---|
| Forge Creators (FC, ₹700) | `the Forge Creators - Appl Form` | `3EgP2L` | 44 | 36,001 | 4,922 | 31,079 | **13.7%** | Active |
| Forge Filmmaking (FFM, ₹800) | `Forge Filmmaking \| MAIN FORM` | `316Mel` | 33 | 35,302 | 8,718 | 26,584 | 24.7% | Paused (≈0 in 7d) |
| Forge Writing (FW, ₹600) | `Forge Writing Appl Form` | `3lY56o` | 19 | 21,555 | 3,861 | 17,694 | 17.9% | Paused (≈0 in 7d) |
| Forge AI (FAI, ₹900) | `the Forge AI Residency Application Form` | `kdWEXR` | 37 | 5,426 | 746 | 4,680 | 13.7% | Active |

**The single most important pattern in this table:** completion rate falls almost monotonically as the form gets longer.

| Form length | Completion |
|---|---|
| 7 Qs (BFP Free Masterclass) | 90.7% |
| 18 Qs (BFP A/B) | 44.5% |
| 22 Qs (BFP EXP) | 27.0% |
| 25 Qs (VE, main) | 25.7% |
| 33 Qs (Forge Filmmaking) | 24.7% |
| 37 Qs (Forge AI) | 13.7% |
| 44 Qs (Forge Creators) | 13.7% |

Length is the dominant lever on completion. Forge Creators at 44 fields loses **86 of every 100** starters.

---

## 2. The main live-cohort form, step by step: `VE | EXP ( Meta Ads )` (`nWLkyk`)

**Structure: 22 pages + a thank-you page. 19 answerable questions (of which 17 are required), plus 6 hidden attribution fields.** Progress bar is **OFF**. Partial submissions and save-for-later are **ON**. On completion the form redirects to a Razorpay payment link (`https://rzp.io/rzp/eiXYHFB`, the ₹400 application fee page). `pageAutoJump` is on, so single-select answers advance the page automatically.

Legend: **[R]** required. Type in brackets. Questions are verbatim. Interstitial pages carry no input; they exist to pre-sell.

| Page | Kind | Question (verbatim) / content | Type | Options (verbatim, trimmed) |
|---:|---|---|---|---|
| 1 | Intro | "Built for the 1% Editors." + intro copy + **6 hidden fields** (UTM / click ids) | hidden | attribution capture only |
| 2 | Intro | Heading + context copy | text | none |
| 3 | Q1 [R] | What's your current editing experience? | multiple choice | I'm just getting started / I've edited a few videos for fun / I've worked on Reels/YouTube content |
| 3 | Q2 [R] | What kind of content are you most excited to edit? | multiple choice | Reels / Shorts · Short films / Cinematic · Podcasts / Long-form |
| 3 | Q3 [R] | What editing software are you currently using? | checkboxes | Premiere Pro · After Effects · Final Cut · DaVinci · CapCut · VN/InShot/Mobile · Not using any yet |
| 4 | Interstitial | Heading + copy | text | none |
| 5 | Q4 [R] | First name | text input | open |
| 5 | Q5 [R] | Last name | text input | open |
| 5 | Q6 [R] | What do you do? | multiple choice | Working Professional at a corporate · Working, not at a corporate · Freelancing · Entrepreneur · Student · Exploring my options · Taking a break |
| 5 | Q7 [R] | What is your most recent designation? | text input | open |
| 5 | Q8 [R] | Which City are you from? | text input | open |
| 5 | Q9 [R] | What is your Gender? | multiple choice | Male · Female · Gender Queer · Trans · Prefer not to say |
| 5 | Q10 [R] | What's your age? | multiple choice | <18 · 18-24 · 24-27 · 28-32 · 32-45 · 45-60 · >60 |
| 5 | Q11 [R] | Your WhatsApp Number | number input | open |
| 5 | Q12 [R] | Your Email ID | email input | open |
| 6 | Q13 [R] | Are you available for the program? | multiple choice | Available from Aug 2nd, 2026 · Available from May 30th, 2026 |
| 7 | Interstitial | Heading + value copy | text | none |
| 8 | Interstitial | Heading + copy | text | none |
| 9 | Video | Embedded video: "The LevelUp Video Editing Academy" | video | none |
| 10 | Q14 [R] | How is the program structured week to week? | multiple choice (+logic) | Only self-paced lessons · **Weekend live sessions + community** · One-time bootcamp then recordings |
| 11 | Interstitial | Answer reveal copy | text | none |
| 12 | Q15 [R] | Who will be guiding you throughout the program? | multiple choice (+logic) | Editing software trainers · **Professional editors who work with...** |
| 13 | Interstitial | Answer reveal copy | text | none |
| 14 | Q16 [R] | What kind of placement or career support is provided? | multiple choice (+logic) | None, it's just a course · A Certificate · **Placement Assistance with Portfolio** |
| 15 | Interstitial | Answer reveal copy | text | none |
| 16 | Q17 [R] | What will you be able to do by the end of the program? | multiple choice (+logic) | Short-form viral · Long-form YouTube · Narrative trailers · **All of the above** |
| 17 | Interstitial | Heading + copy | text | none |
| 18 | Interstitial | Heading + copy | text | none |
| 19 | Interstitial | Heading + testimonial **image** + copy | image | none |
| 20 | Q18 [R] | Select one (scholarship / grant vs individual) | multiple choice | I would like to apply for a grant... · I would like to apply as an individual... |
| 21 | Interstitial | Heading + copy | text | none |
| 22 | Q19 [R] | Write your heart out! (In 100 words or more) | long text | open essay |
| 23 | Thank you | Confirmation, then redirect to Razorpay ₹400 link | - | - |

Notes on the design intent: pages 7 to 21 are a **VSL-style quiz funnel**. Q14 to Q17 are not qualification questions; they are persuasion quizzes that teach the applicant the program's value (live sessions, pro mentors, placement, outcomes) with conditional-logic "correct answer" reveals in the interstitials between them. Q18 is the scholarship-vs-self-pay choice. The ₹400 payment ask happens only after submission, via the redirect.

---

## 3. Submission volume: today and last 7 days

Measured by IST `createdAt`. Today is partial (pull at ~22:00 IST).

| Form | Today completed | Today partial | 7d completed | 7d partial | 7d compl. % |
|---|---:|---:|---:|---:|---:|
| VE (Live, main) | 27 | 107 | 182 | 701 | 21% |
| BFP (Live) | 11 | 25 | 68 | 157 | 30% |
| Creators (Live) | 1 | 5 | 19 | 51 | 27% |
| Forge Creators | 20 | 101 | 123 | 609 | 17% |
| Forge AI | 9 | 47 | 41 | 311 | 12% |
| Forge Filmmaking | 0 | 0 | 0 | 1 | paused |
| Forge Writing | 0 | 0 | 0 | 0 | paused |
| **Live subtotal (today)** | **39** | **137** | | | |
| **Forge subtotal (today)** | **29** | **148** | | | |
| **All funnel forms (today)** | **68** | **285** | | | **≈19%** |

Today the funnel took **353 form-starts and produced 68 completed applications**. The other 285 starters are sitting as partials, and (see next section) about two-thirds of them handed over a phone number and email before quitting.

---

## 4. Where partials stall: field-level drop-off (VE, the main form)

Sample: 2,000 most-recent VE partial submissions, bucketed by the furthest question each one reached. This is the single most actionable dataset in the audit.

| Furthest Q reached | Partials | Cumulative % | What it is |
|---|---:|---:|---|
| Nothing / hidden only | 5 | 0% | bounced on load |
| Q1 experience | 23 | 1% | |
| Q2 content type | 20 | 2% | |
| **Q3 software (end of page 3)** | **405** | **23%** | **Wall 1: end of the qualification page** |
| Q4 to Q11 (contact ladder) | ~76 | 29% | small, steady loss across the 9-field page 5 |
| Q12 Email | 69 | 32% | end of the contact page |
| **Q13 Are you available? (page 6)** | **459** | **55%** | **Wall 2: the gate into the 15-page quiz section** |
| Q14 to Q16 (quiz) | 71 | 59% | quiz fatigue building |
| **Q17 quiz outcome (page 16)** | **423** | **80%** | **Wall 3: deep quiz fatigue** |
| Q18 scholarship select (page 20) | 234 | 92% | |
| Q19 essay (page 22) | 165 | 100% | reached the last screen, did not submit |

Three walls account for ~64% of all abandonment:

- **Wall 1 (Q3, 405 stalls):** after three quick taps on the qualification page, ~23% leave before giving any contact detail. This is the "just clicked the ad" bounce; largely unrecoverable, but the size says the ad-to-form promise and the first screen are drawing a lot of low-intent traffic.
- **Wall 2 (Q13, 459 stalls, the single biggest):** people finish the entire contact/demographic page, answer "Are you available?", and then hit the 15-page interstitial+quiz gauntlet and quit. This is the most expensive leak because these applicants already invested the contact page.
- **Wall 3 (Q17, 423 stalls):** those who push into the quiz run out of patience two-thirds of the way through it.

### The reachability headline

Of the 2,000 VE partials:

| Signal | Count | % |
|---|---:|---:|
| Captured WhatsApp phone | 1,402 | 70% |
| Captured email | 1,414 | 71% |
| **Captured phone AND email** | **1,389** | **69%** |
| Reached essay page but did not finish | 170 | 8% |

**~69% of people who abandon the VE form already gave a phone number and an email** (contact sits at Q11 to Q12, on page 5 of 22, before both quiz walls). They are recoverable leads, and Tally's partial capture already writes them into the funnel (see the data-audit doc). The 285 partials today are not all dead: roughly 195 of them are contactable.

---

## 5. UX analysis

### Step count and time cost

The main form is **22 pages / 19 answerable questions**, with a dense 9-field page (page 5) and a 15-page pre-sell block. Rough active-time budget for a motivated applicant:

| Segment | Pages | Est. time |
|---|---|---|
| Intro (1 to 2) | 2 | 10 to 20 s |
| Qualification (3) | 1 | 15 to 20 s |
| Contact + demographics (5), 9 fields | 1 | 75 to 110 s |
| Availability (6) | 1 | 5 s |
| Video + interstitials + quiz (7 to 21) | 15 | 150 to 240 s (far more if the video is watched) |
| Essay (22) | 1 | 60 to 180 s |
| **Total** | **22** | **≈6 to 9 minutes of active effort**, before the ₹400 payment |

Six to nine minutes is a lot to ask before any payment, and the form gives the applicant **no sense of how much is left** (no progress bar). On a form this long, the missing progress bar is a first-order problem: at Wall 2, the applicant has no idea they are only at page 6 of 22, and the honest answer ("16 more screens") would scare them anyway. That tension is the core of the recommendations.

### Wording and tone

The copy is strong and on-brand: "Built for the 1% Editors", "Write your heart out". Tone is aspirational and human, not bureaucratic. The option sets are concrete and well written. Two frictions:

- The demographic block (gender, exact age band, most-recent designation, city) reads as a form, right in the middle of an otherwise conversational flow, and it all lands on one heavy screen.
- The availability options are stale: one choice is "available from **May 30th, 2026**", a date already in the past at audit time. Stale dated options quietly erode trust and can misroute the availability signal.

### Which questions earn their friction

**Earn it:**
- Q1 experience, Q2 content interest, Q6 what-you-do, Q10 age band: these feed the MQL score (they map to TeleCRM `financial`, `icp`, `age_score`, `job_role`) and genuinely segment intent.
- Q11 WhatsApp + Q12 Email: the entire funnel's join key. Non-negotiable, and correctly placed before the quiz walls.
- Q18 scholarship-vs-individual: routes pricing and intent.

**Do not clearly earn it:**
- Q7 "most recent designation" (free text) and Q8 city (free text) sit on the heaviest page and add typing for thin signal. Designation especially is low-value as free text.
- Q9 gender is asked as required with 5 options; useful for reporting, not for qualification. It could be optional.
- The **four quiz questions (Q14 to Q17)** are the biggest friction source (Walls 2 and 3 bracket them) and collect **no qualification signal at all**. They exist purely to pre-sell. They are a legitimate tactic, but at four required questions across a 15-page block they are over-built for the completion they cost.

### The ~100-word "why" and its effect

The essay ("Write your heart out! In 100 words or more") is **Q19, the final required question, on page 22 of 22**. Findings:

- It is the **last** wall: 165 of 2,000 partials (8%) reach the essay page and still do not submit. Meaningful, but far smaller than Walls 1 to 3. By the time someone reaches page 22 they are highly committed.
- The "100 words or more" ask is **not enforced**. Across leads that wrote anything, the median essay is **~94 characters (~18 words)**, mean ~263 chars, and **only 18% actually reach ~100 words** (500+ chars). So the headline requirement is aspirational, most applicants type a sentence or two, and the field still functions as a final intent filter and MQL input (essay length feeds the score).
- Net: the essay is doing useful work as a commitment gate and quality signal, and it is correctly placed last. It is **not** a top-three leak. Do not remove it; do make its ask honest (see rec 7).

---

## 6. Recommendations (keep Tally, optimize within it)

Ordered by expected completion lift per unit of effort. All are achievable inside Tally's builder.

1. **Turn on the progress bar (`hasProgressBar`) immediately.** One toggle, zero risk, on a 22-page form this is the highest-leverage single change. Applicants at Wall 2 currently fly blind. Test it against the current no-bar version.

2. **Move the ₹400 ask earlier, or split contact from the pre-sell.** Wall 2 (459 stalls) is people who gave contact then hit 15 pre-sell pages. Two options to A/B: (a) shorten the pre-sell block from 4 quiz questions to 1 or 2, or (b) collapse the interstitials so the quiz is 4 questions across ~6 pages instead of ~15. Either reclaims the largest leak.

3. **Split the 9-field page 5 into two lighter pages.** Nine required fields on one screen is the heaviest moment before contact completes. Put name + WhatsApp + email on their own screen (the fields you actually need), and demographics on a second, so a drop mid-page still saves the contact.

4. **Make Q7 designation and Q9 gender optional; drop or auto-derive Q8 city later.** These sit on the heaviest page for thin qualification value. Making them optional shortens the perceived form without losing the MQL-driving questions.

5. **Fix the stale availability options.** Remove "May 30th, 2026" and keep only forward-dated cohort start(s). Stale dates cost trust at Wall 2 and pollute the availability signal that feeds routing.

6. **Front-load one qualification question before the contact page as a "filter + hook".** Wall 1 (405) is pre-contact bounce. Keep the fast 3-tap qualification on page 3 (good), but add a single sharp "are you serious" style question (for example a commitment or budget-comfort tap) before page 5, so lower-intent traffic self-selects out before you spend screens on them, and higher-intent traffic feels invested by the time they give contact.

7. **Make the essay ask honest and lighter.** Change "In 100 words or more" to a realistic prompt ("2 to 3 sentences: why you?") with a soft minimum, or enforce a real minimum if you want the filter. Today the label says 100 words, the median answer is ~18. Aligning the ask to reality reduces the intimidation at the final screen (recovers part of the 8% essay-page drop) without losing the intent signal.

8. **Use Tally's "save and resume" reminder + the partial webhook for recovery.** Save-for-later is already on. Since ~69% of partials leave a phone and email, the win is not in the form, it is in acting on those partials fast (WhatsApp nudge within the hour). The form change is small: make sure the WhatsApp + email fields sit as early as possible (they nearly do) so the maximum share of partials are contactable. Recovery mechanics belong in the data-audit doc.

9. **Standardize the Forge forms down toward the Live length.** Forge Creators (44 fields, 13.7%) and Forge AI (37 fields, 13.7%) are leaving the most on the table. The 7-field BFP masterclass form completes at 90.7%. Every field cut is worth roughly 1 to 2 points of completion in this account's own data. Target the Forge application forms at ~20 answerable fields, matching VE.

10. **A/B length directly, using the forms you already have.** BFP already runs an 18-field A/B variant at 44.5% next to the 22-field EXP form at 27.0%. That is a ~17-point completion gap inside one product. Formalize that test across VE and the Forge SKUs: clone the main form, cut it to ~12 to 14 fields, and split traffic. Tally supports this natively; the account is already doing it for BFP.

---

### Method notes

- Forms enumerated via `GET /forms` (paginated, 904 total). Structure via `GET /forms/{id}` (blocks) and the `questions` array on `GET /forms/{id}/submissions`. Counts via `totalNumberOfSubmissionsPerFilter` and by paginating `?filter=all|partial|completed`.
- Submissions sort newest-first by `updatedAt`; today/7d counts paginate until `updatedAt` passes the window floor, then bucket by IST `createdAt`, so interleaved older-but-resumed partials do not inflate the count.
- No writes were made. All calls were GET/enumeration only.
