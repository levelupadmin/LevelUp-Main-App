# Breakthrough Filmmakers' Program — Application Funnel Walkthrough

First-hand QA walk of the **live-cohort application** as a dummy applicant, captured at
**iPhone-13 width (390×844)**, Playwright Chromium, on **2026-07-16**.

> Submitted as an intentional QA test with unmistakably-fake data so the sales team
> recognises and ignores it — name **TEST DUMMY Claude QA**, email
> **test+claudeqa@leveluplearning.in**, WhatsApp **9999999999**, and a 'why' essay that
> repeats "THIS IS AN AUTOMATED QA TEST SUBMISSION BY CLAUDE — PLEASE IGNORE."
> **Hard stop at the Razorpay page** — no payment details entered, Pay never clicked.

Screenshots live in `./shots/` and are referenced inline below.

---

## The entry path

| Hop | URL | Notes |
|-----|-----|-------|
| Marketing / offering page | `https://app.leveluplearning.in/p/breakthrough-filmmakers-program` | H1 "Breakthrough Filmmakers' Program", chips "Live · Weekends · Application-only · 12 weeks", 3× **"Apply for an invite"** CTAs |
| Apply CTA target | `https://www.leveluplearning.live/bfp-cta` | Vanity link, 302-redirects → |
| Application form | `https://tally.so/r/npvj5y` | Tally form "The Breakthrough Filmmakers' Program", conversational, one-question-per-screen, progress bar labelled "Page N **of 20**" |
| Payment handoff | `https://pages.razorpay.com/pl_S1niLUkmcJm0pJ/view` | Razorpay hosted Payment Page, **₹400** application fee |

The other four live cohorts (UI/UX Design Academy, Video Editing Academy, Screenwriting &
Storytelling, Creator Academy) use direct `tally.so/r/*` links; **BFP is the only one
behind the `leveluplearning.live/bfp-cta` vanity redirect.**

---

## Headline numbers

- **Screens Start → paywall:** 17 Tally screens + 1 Razorpay page = **18 screens**.
  (Progress bar says "of 20"; the **Submit** button appears on screen 17 — the extra
  counted pages are conditional branches, e.g. the grant path / lateral-entry path, that
  this route didn't traverse.)
- **Questions actually answered:** **16** — 7 typed (first name, last name, designation,
  city, WhatsApp, email, 100-word essay) + 9 single-choice (experience, 3 quiz questions,
  occupation, gender, age, availability, grant choice). **9 of the 16 are crammed onto one
  screen** (page 11).
- **Non-question screens:** intro/Start, a video, a quiz-intro, 4 pure "Continue"
  interstitials (press-continue, 50%-congrats, get-to-know-you, almost-done), a pricing
  reveal, a grant explainer, and the submit page.
- **Time:** form self-estimates **"5–7 minutes"**; realistic human **~7–10 min** (the
  100-word essay + 9-field page dominate); automated wall-clock here **~11.5 min** incl.
  screenshots.
- **Everything is required** — there is not a single optional question on the happy path.

---

## Step-by-step journey

| # | Shot | Screen | Type | Friction |
|---|------|--------|------|:-:|
| 00 | `apply-step-00-offering-page.png` | Offering page, "Apply for an invite" | Marketing | 1 |
| 01 | `apply-step-01-form-landing.png` | Intro: "Request an invite… understand if you are the right fit." "Takes about 5-7 minutes." **Start** | Splash | 1 |
| 02 | `apply-step-02.png` | "What level of experience are you at in filmmaking?" (A–D) | Radio ×4 | 1 |
| 03 | `apply-step-03.png` | "Press continue below to understand how the program can help you…" | Interstitial | 2 |
| 04 | `apply-step-04-video.png` | "Click the play button to start." (VSL video) | Video | 2 |
| 05 | `apply-step-05-quiz-intro.png` | "We will now ask you some questions… If you answer correctly, you will be able to book an interview." | Quiz gate intro | 3 |
| 06 | `apply-step-06-quiz-q1.png` | Quiz Q1 "What is The Breakthrough Filmmakers' Program?" | Radio ×4 | 2 |
| 07 | `apply-step-07-quiz-q2.png` | Quiz Q2 "At the program, you receive mentorship from:" | Radio ×2 | 2 |
| 08 | `apply-step-08-quiz-q3.png` | Quiz Q3 "When are the sessions… scheduled?" | Radio ×2 | 2 |
| 09 | `apply-step-09-50pct.png` | "Congratulations! You're 50% done — and flying." | Interstitial | 1 |
| 10 | `apply-step-10-getting-to-know.png` | "Now, we want to get to know you a bit more." | Interstitial | 1 |
| 11 | `apply-step-11-personal-info.png` / `-11b-…-filled.png` | **9 required fields on one screen:** first name, last name, occupation (×7), designation, city (free text), gender (×5), age (×7), WhatsApp (numeric), email | Mixed | **4** |
| 12 | `apply-step-12-availability.png` | "Are you available for the program?" (8 Aug next cohort / 6 Jun lateral entry) | Radio ×2 | 2 |
| 13 | `apply-step-13-pricing.png` | Price reveal: "INR 34,999* overall… from INR 2,999 monthly, interest-free (No-cost EMI)." | Interstitial | 3 |
| 14 | `apply-step-14-grant.png` | "The Breakthrough Filmmakers' Grant Program" (grant / no-scholarship) | Radio ×2 | 3 |
| 15 | `apply-step-15-almost-done.png` | "ALMOST DONE - Just one last question" | Interstitial | 1 |
| 16 | `apply-step-16-why.png` / `-16b-…-filled.png` | **The essay:** "…write your heart out. (In 100 words or more)" | Textarea | **4** |
| 17 | `apply-step-17-submit-book-interview.png` | "Next Step: Book Your Interview!" — 5-step process, **Submit** | Submit | 3 |
| 18 | `apply-step-18-razorpay-handoff.png` | **Razorpay Payment Page — ₹400 — HARD STOP** | Payment | **4** |
| 19 | `apply-step-19-abandon-reopen.png` | Abandon test: form reopened fresh | — | — |

**Mechanics observed:** every page has a **Back** button (from page 2 on); choice pages
do **not** auto-advance (you always press **Next**); the WhatsApp field opens the numeric
keypad (`inputmode="decimal"`); the phone field **accepted `9999999999`** with no
country-code picker and no format error; the city field is **unvalidated free text**;
page-11 validation is enforced (it blocks Next until all 9 are filled).

---

## 5 worst friction moments

1. **Page 11 — the "wall of nine".** Nine required questions stacked on a single mobile
   screen (name×2, occupation, designation, city, gender, age, WhatsApp, email). After a
   gentle one-question-per-screen rhythm, this is a sudden, tiring form dump and the most
   likely drop-off point. `apply-step-11-personal-info.png`
2. **The Tally → Razorpay handoff (page 17 → 18).** Submit does **not** show any "your
   application was received" confirmation — it silently jumps to a **different domain**
   (`pages.razorpay.com`) that opens with a sales letter and a **locked ₹400 charge**, and
   **re-asks email + phone that were just collected** (both fields load empty). Jarring.
   `apply-step-18-razorpay-handoff.png`
3. **The 100+ word essay with no word counter.** The single biggest writing ask —
   "(In 100 words or more)" — has no live counter, no min/max indicator, nothing to tell
   the user when they've written "enough". `apply-step-16-why.png`
4. **Price revealed at screen 13 of ~17, after all personal data is captured.** The ₹34,999
   fee (and the separate ₹400 application fee, not surfaced until screen 17) appear only
   deep in the funnel — a reveal-after-commitment pattern. `apply-step-13-pricing.png`
5. **The scored quiz gate (screens 5–8).** A four-screen knowledge quiz whose intro says
   "**If you answer correctly**, you will be able to book an interview" — gating a paid
   interview behind a mini-exam with leading answer copy adds four screens and a faint
   whiff of gimmick. `apply-step-05-quiz-intro.png`

Runner-up: **interstitial tax** — 4 pure "Continue" screens + 1 video + 1 quiz-intro
inflate a 16-question form to 17 screens; and the availability option **"6th June, 2026"**
is **already in the past** (today is 16 Jul 2026) — stale data.

## 5 best moments

1. **Mid-form encouragement:** "Congratulations! You're **50% done — and flying**." A
   genuinely nice morale beat with the progress bar. `apply-step-09-50pct.png`
2. **Upfront time honesty:** the intro states "**Takes about 5-7 minutes to complete**",
   setting expectations before the first tap. `apply-step-01-form-landing.png`
3. **Transparent, de-risked pricing:** "**No-cost EMI**" from ₹2,999/mo, plus mention of
   financial aid/grants — the fee is framed affordably, not hidden. `apply-step-13-pricing.png`
4. **Refund guarantee on the fee:** "the fee will be **fully refunded**" if not selected —
   this materially lowers the ₹400 ask and is repeated on the Razorpay page.
   `apply-step-17-…png`, `apply-step-18-…png`
5. **Clear "what happens next":** a numbered 5-step roadmap (pay → book → interview → wait →
   decision) before the paywall, so the applicant knows the process. `apply-step-17-…png`

Also good: **Back on every page**, the clean conversational rhythm for most of the form,
and the correct **numeric keypad** on the phone field.

---

## Wording — quotes worth keeping

- "Congratulations! You're 50% done — and flying."
- "12 weeks of learning, doing and becoming."
- "If you're not selected, the fee will be fully refunded."
- "Let's build your story together." (Razorpay page sign-off)

## Wording — quotes worth fixing

- **Typo, page 16 essay prompt:** "The Breakthrough **Filmmaerks'** Program" → "Filmmakers'".
- **Double article, page 17:** "an invite to **the The** Breakthrough Filmmakers' Program" → "the Breakthrough…".
- **Grammar, Razorpay page:** "Join one of India's Highest Rated Online **Film  School**"
  (double space + singular after "one of…") → "one of India's highest-rated online film schools".
- **Filler, page 16:** "why you **really really** want to be a student" → tighten.
- **Stale option, page 12:** "6th June, 2026 for the Lateral Entry of the current Cohort" —
  the date has already passed; refresh per cohort.
- **Grant copy, page 14** is a dense paragraph and frames aid as *harder* to win
  ("acceptance rate may be lower than a normal application"), which may discourage the exact
  applicants it's meant to help.

---

## What the handoff into payment feels like

Finishing the application is **anticlimactic and slightly disorienting**. You complete 16
screens of increasingly personal questions, pour effort into a 100-word essay, hit
**Submit** — and instead of a "thank you, we've got your application" moment, the page
**vanishes and reloads on `pages.razorpay.com`**, a brand-new domain, opening with a
marketing letter and a **hard ₹400 charge** (`apply-step-18-razorpay-handoff.png`). The
page shows the amount **₹400.00**, a single **"Pay ₹ 400.00"** button, and an **empty email
+ phone form you must fill again** even though you just entered both.

The **saving graces** are the refund promise ("If you're not selected, the fee will be fully
refunded") and the earlier 5-step roadmap that warned payment was coming. But the net
emotional arc is: *effort → abrupt paywall on an unfamiliar domain → re-enter your details*.
Two cheap wins would soften it: (a) a one-line Tally confirmation ("Application received —
last step is a refundable ₹400 to unlock interview booking") **before** the redirect, and
(b) **pass email + phone through to Razorpay** so they're pre-filled.

*(Hard stop honoured: the Razorpay page was screenshotted and read only. No payment details
were entered and "Pay" was never clicked. No Calendly/interview slot was booked — booking
sits behind the fee, so it never appeared pre-payment.)*

---

## Abandon behaviour (`apply-step-19-abandon-reopen.png`)

Reopening the form URL fresh in the same browser (cookies/localStorage intact) **restarts at
the intro "Start" screen — there is no "resume where you left off" affordance.** Clicking
Start then shows **page 2 with no answer pre-selected**, i.e. prior answers are **not
restored**. Tally does keep a `FORM_SESSION_npvj5y` and a `RESPONDENT` UUID in
`localStorage`, but nothing in the UI surfaces saved progress or repopulates fields.

**Implication:** an applicant who abandons mid-form and comes back **starts over from zero**.
For a 16-question, ~7-minute form that is a real re-entry cost and a likely source of
never-returns. Consider enabling Tally's partial-save/"continue later" so returning users
resume instead of restart. *(Caveat: this reopen was performed just after a completed submit;
the observed no-resume + blank-fields behaviour is nonetheless what a mid-form abandoner sees
on reload.)*
