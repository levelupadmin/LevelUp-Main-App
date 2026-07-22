# Live-Cohort Application Funnel: Data-Layer Audit

Audit date: 2026-07-16 (~22:00 IST). Systems: **Tally** (forms), **TeleCRM** (CRM/leads), **Razorpay** (payments), plus the app's **Supabase** schema for context. All external calls were read-only GET. This is a pure audit: **no schema changes are proposed here.**

The one-line funnel:
**Meta ad → Tally form → (partial capture + completion) → TeleCRM lead (MQL-scored) → Razorpay ₹400/₹600-900 application fee → ₹8K/₹15K seat-confirm → full/balance payment.**

---

## 1. End-to-end data flow, as it actually runs

```
                                 ┌─────────────────────────────────────────────┐
   Meta / YT ad                  │  the applicant, identified only by phone+email │
        │                        └─────────────────────────────────────────────┘
        ▼
   TALLY form  ──(partial: phone captured)──┐
   (e.g. VE nWLkyk)                          │
        │ completion                         │
        │                                    ▼
        │                            TELECRM lead  (fields.*, status picklist, mql)
        │                                    │   status advances: NEW → ... → Converted
        │ redirect on submit                 │
        ▼                                    │  join = phone / email_1
   RAZORPAY payment link  ───────────────────┘  (~90% match, no hard key)
   rzp.io/rzp/eiXYHFB  (₹400 app fee)
        │  notes = {email, name, phone}     ┌──────────────────────────────────┐
        ▼                                   │ Supabase cohort_applications:      │
   ₹8,000 / ₹15,000 seat confirm            │ built + wired in code, but NOT the │
   full / balance payment                   │ path the live funnel flows through │
                                            │ (0 of 199 recent payments link it) │
                                            └──────────────────────────────────┘
```

**The structural fact that governs everything below:** the live funnel is stitched together by **phone number and email only**. No system passes a stable application id to the next. Tally's completion redirect to the Razorpay link does not carry the Tally `responseId`; the Razorpay page re-collects name/email/phone into `notes`; TeleCRM matches back on phone/email. Every cross-system question ("did this applicant pay?", "did this payer schedule an interview?") is answered by a phone/email join, not a foreign key.

---

## 2. Tally to Supabase: the webhook path (built in code)

The repo ships an edge function `supabase/functions/tally-application-webhook/index.ts` that is the *intended* Tally to app bridge:

- Fires only on `eventType === "FORM_RESPONSE"` (i.e. **completed** submissions; partials never hit it).
- Verifies a Tally HMAC signature (`TALLY_SIGNING_SECRET`).
- Extracts, by fuzzy label match: `full name`, `email`, `phone/mobile/whatsapp`, `city/location`, `occupation/profession`, `about/bio/tell us`.
- Finds the matching offering by `offerings.tally_form_url` **containing the form id**, but only among offerings with `payment_mode = 'staged'`.
- Upserts a row into **`cohort_applications`** (dedup by email per offering, idempotent on `tally_response_id`), storing the full Tally payload in `tally_data` (jsonb).

### `cohort_applications` shape (migration `20260413100000`)

```
id, offering_id, user_id, full_name, email, phone, city, occupation, bio,
status  CHECK IN ('submitted','app_fee_paid','interview_scheduled','interview_done',
                  'accepted','rejected','confirmation_paid','balance_paid',
                  'enrolled','withdrawn','waitlisted'),
app_fee_paid_at, tally_response_id, tally_data(jsonb),
interview_notes, interview_date, rejection_reason,
app_fee_payment_id, confirmation_payment_id, balance_payment_id,
created_at, updated_at
```

The status enum encodes a clean, complete funnel. The **staged payment machinery** (`create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`) advances it: `app_fee` payment sets `app_fee_paid`, `confirmation` sets `confirmation_paid`, `balance` sets `balance_paid` then `enrolled`. Those payments carry `notes = {offering_id, user_id, payment_order_id}`.

### The catch: this is not the path the live funnel uses

Across **199 Razorpay payments in the last 7 days, 0 carried `payment_order_id` / `offering_id` / `user_id` in notes.** Every application-fee and confirm payment came through Razorpay Payment Pages/Links with only `{email, name, phone}`. So in production today:

- The live funnel completes on Tally, then hands off to a **hardcoded Razorpay link** (the form's `redirectOnCompletion`), not to the app's `create-razorpay-order`.
- `cohort_applications` is therefore populated (if at all) only for offerings explicitly configured `payment_mode='staged'` with a matching `tally_form_url`, and even then the fee is not being collected through the app's staged order path.
- **The intermediate funnel states (`interview_scheduled`, `interview_done`, `accepted`, `rejected`) have no writer anywhere in the codebase.** Nothing sets them. They would have to be set by hand in the DB. The live interview/accept/reject tracking happens in **TeleCRM**, not here.

Net: the app's cohort pipeline is real code but a **parallel, largely-dormant track**. The operational funnel is **Tally → TeleCRM → Razorpay links**. Treat `cohort_applications` as aspirational schema, not as the current source of truth. (Confirming exactly how many `staged` offerings exist in prod requires a Supabase read, which is out of this audit's read-only-external scope; the Razorpay evidence is conclusive that the app path is not where the money flows.)

---

## 3. TeleCRM: what the CRM actually holds

Base `https://next.telecrm.in/autoupdate/v2`, `POST /enterprise/{id}/lead/search`, body `{"fields":{"created_on":{...}}}`. One lead = one Tally submission (completed, or phone-captured partial). Windows sampled: today (88 leads) and last 14 days (1,354 leads).

### The lead record

Top-level: `id, status, score, rating, labelids, actions, createdBy, fields{...}`.

`fields.*` in active use (present on ~all leads): `phone`, `email_1`, `name`, `created_on`, `modified_on`, `product_1`, `mql`, `mql_bucket`, `essay`, `character_count`, `availability`, `scholarship`, `age`, `city`, `designation`, `job_role`, `gender`, `financial`, `icp`, `age_score`, `reason`, `source`, `ad_name`, `campaign`, `form_source`, and (on a minority) `application_status`, `fdclid`, `click_ts`.

Observations:
- **`labelids` (tags) are empty** on every sampled lead. TeleCRM's tag system is not the stage tracker.
- Top-level `score` and `rating` are always 0. **The real MQL is `fields.mql`** (numeric) with `fields.mql_bucket` as a band. The scoring inputs are visible as separate fields: `financial`, `icp`, `age_score`, and `character_count` (essay length feeds the score).
- `form_source` = `MAIN FORM` / `EXP FORM` / `NEW FORM` identifies which Tally variant produced the lead.

### The funnel stage lives in the top-level `status` picklist

This is the answer to "what are the real stage names". Full vocabulary observed over 14 days (1,354 leads), in rough funnel order:

| `status` value | 14d count | Meaning |
|---|---:|---|
| `NEW` | 1,063 | fresh lead, untouched (includes phone-captured partials) |
| `DNP 1`, `DNP Reminder` | 4, 50 | "did not pick up" call attempts |
| `Direct Junk` | 38 | disqualified |
| `WARM`, `HOT` | 3, 12 | sales temperature |
| `Fee Link Sent` | 4 | application-fee link sent, not yet paid |
| `Application Fee Paid` | 43 | ₹400 / ₹600-900 fee captured |
| `Interview Scheduled` | 43 | Calendly interview booked |
| `Need to reschedule interview` | 1 | |
| `Interview completed` | 14 | interview done |
| `No show` | 18 | booked, did not attend |
| `Deffered` | 1 | deferred to a later cohort |
| `Converted` | 36 | **won**: seat-confirm / full payment taken |
| `Lost` | 24 | dropped out |

Mapping to the stage names the audit asked for:
- **partial submission** → not a distinct status. Partials arrive as `NEW` with an empty `essay`. See below.
- **application fee paid** → `Application Fee Paid` (preceded by `Fee Link Sent`).
- **interview scheduled** → `Interview Scheduled` (then `Interview completed` / `No show` / `Need to reschedule interview`).
- **accepted** → **no explicit "Accepted" status exists.** Acceptance is implicit between `Interview completed` and `Converted`. This is a genuine gap in the vocabulary.
- **confirmed** → `Converted` is the single terminal won state. There is **no separate "seat confirmed" vs "paid in full" status**; both collapse into `Converted`. The distinction (₹8K/₹15K confirm vs full payment) is only visible in Razorpay, not in the TeleCRM status.

Today's 88 leads sat at: `NEW` 78, `Interview Scheduled` 9, `Application Fee Paid` 1. High-MQL (mql ≥ 40) = 65% today, 63% over 14 days. Product split today: VE 27, FC 14, FFM 14, FW 12, FAI 9, BFP 9, L3C 1.

### Partial vs completed is only inferable from the essay

Partial capture is ON in Tally, so phone-captured partials become leads. There is **no flag** distinguishing them. The only signal is the essay: a completed application has `essay` text and `character_count > 0`; a partial that quit before the last page has an empty essay.

- **30% of 14-day leads (400 of 1,354) have an empty essay** = partial-captured or pre-essay. 70% have an essay.
- Cross-tab: of `NEW` leads, 686 have an essay and **377 do not** (the recoverable partials sitting in the CRM right now).

### How does `Application Fee Paid` get set?

There is no Razorpay reference on the lead (no payment id, order id, or amount field). The status is set by **matching the Razorpay payer's phone/email back to the lead** (whether by a rep manually or a phone/email automation), the same ~90% phone/email join used everywhere. Consequence: an app-fee payment whose phone/email does not match a lead cleanly will not advance a lead's status, and there is no hard link to audit which payment corresponds to which lead.

---

## 4. Razorpay: what the payment layer shows

Base `https://api.razorpay.com/v1/payments`, HTTP Basic. Two accounts: **Admin (live)** carries everything; **Edtech confirmed dormant** (0 payments in 7 days). Amounts are paise / 100. Sample: last 7 days, 199 payments (Admin).

### Amount is the product (Razorpay carries no SKU)

| Amount | Meaning | 7d captured | 7d failed |
|---:|---|---:|---:|
| ₹400 | Live application fee (cohort not distinguishable from amount) | 23 | 5 (+1 refunded) |
| ₹600 | Forge Writing app fee | 43 | 6 |
| ₹700 | Forge Creators app fee | 22 | 7 |
| ₹800 | Forge Filmmaking app fee | 8 | 2 |
| ₹900 | Forge AI app fee | 6 | 1 |
| ₹8,000 | Live seat-confirm deposit | 8 | 0 |
| ₹15,000 | Forge seat-confirm deposit | 27 | 5 |
| ₹22K / 27K / 32K | Live remaining balance | a few each | |
| ≥ ₹40K (45K, 50K, 55K, 65K, ...) | Forge full-programme payment | ~25 total | few |

**Today (partial day):** 10 application fees captured (₹400 ×2 Live, ₹600 ×5 + ₹700 ×3 Forge = 8 Forge), plus 3 × ₹8,000 Live confirms, 5 × ₹15,000 Forge confirms, and 4 full/balance payments (₹25,785 / ₹27,000 / ₹32,000 / ₹65,000).

### Payment shape and the linkage

Each payment has: `amount, status, created_at, method, contact, email, order_id, notes, error_*`. Method is UPI-dominant (~85%), rest card / netbanking / emi.

`notes` content across the 199 payments:

| notes keys | count | which page |
|---|---:|---|
| `{email, full_name, phone}` | 120 | Forge / newer payment pages |
| `{email, name, phone}` | 32 | Live / older pages |
| `{email, phone}` | 31 | |
| `{}` empty | 14 | generic links (identity only in top-level `contact`/`email`, sometimes a `description` ref) |
| `{email, name, phone, provider}` | 1 | |

**No payment carries `application_id`, `offering_id`, `lead_id`, `tally_response_id`, or `payment_order_id`.** The linkage from a payment to an application or lead is `notes.phone` / `notes.email` (or top-level `contact`/`email`), joined to the lead's `phone` / `email_1`. `invoice_id` is empty on all (these are Payment Pages/Links, not Razorpay Invoices). `order_id` is present but is Razorpay's own per-page order, not an app order.

### Failed vs abandoned

35 payments failed in 7 days (e.g. `payment_timed_out` at `payment_authentication`). A **failed** payment leaves a record (visible, recoverable outreach target). An applicant who lands on the ₹400 page and closes it **without attempting** leaves **no record at all** (`created` count is 0 across all amounts). So "abandoned at the payment page" is invisible in Razorpay; it can only be inferred as "Tally-completed and/or `Fee Link Sent` in TeleCRM, but no matching captured ₹400".

---

## 5. THE GAPS: journey states trackable today vs not

"Trackable" = can be determined from data available today without a new integration. The join everywhere is phone/email.

| Funnel state | Trackable today? | How / why not |
|---|---|---|
| Started the form (any product) | **Yes** | Tally partials + completed, by `createdAt`, per form. |
| **Partial: gave phone/email then quit** | **Partial** | Exists as a TeleCRM `NEW` lead with empty `essay`, and as a Tally partial. No explicit "partial" flag; you infer it from the empty essay. ~377 such leads sitting in `NEW` now. |
| Where in the form they stalled | **Yes (Tally only)** | Tally partial payloads expose furthest-question reached (see UX doc). **Not** surfaced in TeleCRM or the app. |
| Completed application | **Yes** | Tally `completed`; TeleCRM lead with `essay` populated. |
| MQL / high-MQL | **Yes** | `fields.mql` (≥40 = high). Present on ~92% of leads. |
| Application fee paid | **Yes, but join-dependent** | Razorpay captured ₹400/₹600-900 **and** TeleCRM `Application Fee Paid`. The two are linked only by phone/email; a mismatch silently desyncs them. |
| **Completed form, got fee link, did NOT pay ("left at Razorpay after 100 words")** | **Weak / inferred** | No positive signal. It is "TeleCRM `Fee Link Sent` or completed-with-essay" **minus** "a matching captured ₹400 in Razorpay". A page-close before attempting leaves no Razorpay row at all. Only *failed* attempts (35/7d) are directly visible. |
| **Fee paid but interview NOT scheduled** | **Yes** | Leads stuck in `Application Fee Paid` (or `Fee Link Sent`) that never reach `Interview Scheduled`. Directly queryable in TeleCRM by status. |
| Interview scheduled / completed / no-show | **Yes (TeleCRM only)** | `Interview Scheduled` / `Interview completed` / `No show`. Interview date/notes live in TeleCRM (and in `cohort_applications.interview_date/notes`, which is unwritten today). Calendly is the source; it is not joined to the app. |
| **Accepted / rejected after interview** | **No explicit state** | TeleCRM has no `Accepted` status; acceptance is implicit between `Interview completed` and `Converted`. `rejected` exists in the app enum but is never written. |
| Seat confirmed (₹8K/₹15K deposit) | **Partial** | Visible in Razorpay by amount. In TeleCRM it collapses into `Converted` with no distinction from full payment. |
| Paid in full / balance | **Partial** | Visible in Razorpay by amount (≥₹40K Forge, ₹22-32K Live balance). Again only `Converted` in TeleCRM. |
| Which specific cohort a ₹400 payer belongs to | **No (from Razorpay alone)** | All Live cohorts share ₹400. Requires joining the payer's phone/email to the lead's `product_1`. |
| The same human across all four systems | **No hard key** | Only phone/email. ~90% match; the ~10% who use different email/phone at the payment page vs the form fall out of the join. |

### The five most important gaps

1. **No hard identity key across systems.** Everything hangs on phone/email. Tally's completion redirect to the Razorpay link drops the `responseId`; Razorpay re-collects identity; TeleCRM matches back. The ~10% who mistype or switch email/phone become orphaned payments and stalled leads.

2. **"Completed the form but never paid the ₹400" is not positively tracked.** This is the single highest-intent drop-off (they wrote the essay, then bailed at payment), and today it is only inferable as an absence (essay present, no matching captured ₹400). Page-close-before-attempt leaves zero footprint in Razorpay.

3. **Partial applicants are invisible as a class.** ~30% of leads and ~69% of form-abandoners are phone+email-captured partials, but they carry no "partial" flag: they sit in `NEW` indistinguishable from real completions except by an empty `essay`. The recovery list exists but is not labelled.

4. **No "Accepted" state, and seat-confirm vs full-payment collapse into `Converted`.** Post-interview acceptance and the ₹8K/₹15K-confirm-vs-full-payment distinction are lost in TeleCRM; they survive only in Razorpay amounts. Interview outcome and money-stage cannot be read from one system.

5. **The app's `cohort_applications` pipeline is not the live funnel.** The intended single source of truth (Tally webhook to Supabase, staged payments advancing status) is dormant: 0 of 199 recent payments used it, and the interview/accept/reject statuses have no writer. The real funnel state is spread across TeleCRM `status` + Razorpay amounts, so the app itself currently has no first-party view of a user's funnel stage.

---

## 6. What the app could read to know a user's funnel stage

The app logs users in by **phone OTP (MSG91)**, so the logged-in user's phone (and email) is exactly the join key the whole funnel already runs on. Without any schema change, the app already has the identity needed to locate a user in the funnel by reading the three systems it can query:

- **Tally (phone/email):** is there a completed submission? a partial, and how far did it get? → render "finish your application" with a deep resume.
- **TeleCRM (phone/email_1):** the lead's `status` and `mql`. → "Application Fee Paid" but not "Interview Scheduled" → render "book your interview" (Calendly). `Fee Link Sent` and no payment → render "complete your ₹400 to apply".
- **Razorpay (contact/email):** captured ₹400 (applied), ₹8K/₹15K (seat confirmed), ≥₹40K/balance (paid in full). → render the next money step, or gate content if fully paid.

The stage-to-CTA logic the app could drive from those reads:

| Detected state (from phone/email reads) | Right push |
|---|---|
| Tally partial, no completion | Resume application (deep link to the saved Tally session) |
| Completed form, no captured ₹400 | Pay the ₹400 application fee |
| `Application Fee Paid`, no `Interview Scheduled` | Book your interview (Calendly) |
| `Interview completed`, not `Converted` | Awaiting decision / pay seat-confirm when accepted |
| ₹8K/₹15K confirm paid, balance not paid | Pay your balance before the cohort starts |
| `Converted` / full payment | Enrolled: show cohort content |

The only thing missing to make this real is a **read path** from the app to TeleCRM/Razorpay/Tally keyed on the logged-in phone/email (plus a positive marker for "completed form, fee not paid"). That is a follow-up design, deliberately out of scope for this pure audit.

---

### Method notes

- TeleCRM: `POST /enterprise/{id}/lead/search` with `created_on` windows for today and the last 14 days; enumerated `status`, `fields.*`, `mql`, essay presence. No writes.
- Razorpay: `GET /payments?from&to&count&skip` over 7 days, both accounts merged; bucketed by amount and status; inspected `notes`/`description`/`method`. No writes.
- Supabase shapes read from the repo migrations and edge functions (`cohort_applications` migration `20260413100000`; `tally-application-webhook`, `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`). No DB queries were run.
- Secrets were sourced from the iCloud LevelUp Core `.env.*` vault and referenced by variable name only; no key material appears in this document.
