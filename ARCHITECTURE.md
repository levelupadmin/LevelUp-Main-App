# LevelUp Main App — architecture map

The map an AI (or a new human) reads first to get its bearings. `CLAUDE.md` covers
how to *ship* this app; this covers how it's *built*. Keep it current: if you add a
feature area, rename a core concept, or move where money/auth flows, update this file.

**Stack:** Vite + React 18 + TypeScript + shadcn/ui + Tailwind (frontend, in `src/`),
Supabase Postgres + Deno edge functions (backend, in `supabase/functions/`), Razorpay
(payments), VdoCipher (DRM video), MSG91 (phone OTP), Capacitor (Android + iOS shells).
The web app is authoritative; the native shells wrap it and are read-only on buy CTAs
(Apple/Play Reader Rule — gated via `isNative()`).

---

## Vocabulary (call these by the same name everywhere)

- **Offering** (`offerings`) — a thing a user can buy: a masterclass, a course bundle,
  a live cohort, or an event. Carries price, GST mode/rate, status, payment_mode.
- **Course** (`courses`) → **Section** (`sections`) → **Chapter** (`chapters`) — the
  learning content tree. An offering links to courses via `offering_courses`.
- **Enrolment** (`enrolments`) — a user's granted access to an offering. This is the
  source of truth for "can this user watch this". Created only after a captured payment
  (or a free/legacy grant).
- **Payment order** (`payment_orders`) — one purchase attempt: the priced line items
  (subtotal/discount/gst/total), the Razorpay order id, and capture state.
- **Bump** (`offering_bumps`) — an order-bump add-on offered on the checkout of a parent
  offering. **Coupon** (`coupons`) — a discount code (percent or flat). Both feed pricing.
- **Cohort application** (`cohort_applications`) + **staged payments** — live-cohort
  offerings (`payment_mode = "staged"`) are paid in stages: `app_fee` → `confirmation`
  → `balance`, tracked on the application row. Bumps/coupons don't apply to staged.
- **Legacy enrolment** (`legacy_enrolments`) — ~74k TagMango customers migrated in;
  their phone↔email pairing lets them log in by phone and auto-claim entitlements.

---

## Feature → where it lives

| Feature | Frontend | Backend (edge / RPC) |
| --- | --- | --- |
| **Buy / checkout** | `pages/CheckoutPage.tsx` + `hooks/useCheckout*` + `components/checkout/`, `components/offering/` | `create-razorpay-order`, `guest-create-order`, `verify-razorpay-payment`, `razorpay-webhook`, `create-free-enrolment`, `validate-coupon` |
| **Sales page** | `pages/PublicOffering.tsx`, `components/offering/` | `validate-coupon` |
| **Learning / playback** | `pages/ChapterViewer.tsx`, `pages/CourseDetail.tsx`, `components/chapter/`, `VdoCipherPlayer.tsx` | `get-vdocipher-otp`, `get-vdocipher-video-meta` |
| **Auth / login** | `pages/Login.tsx`, `pages/Signup.tsx`, `contexts/AuthContext.tsx`, `lib/msg91-widget.ts` | `verify-msg91-otp`, `check-user-exists`, `auth-email-hook` + `find_login_identity` RPC |
| **Live cohorts** | `pages/CohortDashboard.tsx`, `pages/ApplicationStatus.tsx`, `components/cohort/`, `components/live/` | `register-for-event`, `verify-event-payment`, `notify-cohort`, `tally-application-webhook` |
| **Refunds / invoices** | `pages/ProfilePage.tsx`, `components/profile/`, `lib/invoice.ts` | `process-refund`, `generate-invoice-pdf` |
| **Certificates** | `components/certificates/`, `hooks/useCertificateAutoGenerate.ts`, `lib/certificate-generator.ts` | (client-generated) |
| **Admin** | `pages/admin/*` (37 pages), `components/admin/` | `admin-api`, `send-bulk-email`, `send-notification`, `admin-grant-access` (CSV import / add student), `admin-update-user` (edit login email/phone), RPCs `admin_duplicate_offering` / `admin_duplicate_course` |
| **Email / notifications** | `components/notifications/`, `hooks/useNotifications.ts` | `queue-transactional-email`, `process-email-queue`, `_shared/email-templates/`, purchase receipt in `_shared/receipt.ts` |

Cross-cutting: `contexts/AuthContext.tsx` (session + user), `components/guards/` (route
gating), `lib/platform.ts` (`isNative`/`isAndroid`), `lib/analytics.ts` (pixels),
`lib/sentry.ts` + `components/ErrorBoundary.tsx` (error capture). Routing: `src/App.tsx`.

---

## How money flows (one path, server-authoritative)

```
PublicOffering / CheckoutPage          ← preview only (useCheckoutPricing)
        │  user clicks Pay
        ▼
create-razorpay-order  (signed-in)     ← RE-prices from the DB; the on-screen
guest-create-order     (anonymous)        total is never trusted
        │  → creates payment_orders row + Razorpay order
        ▼
Razorpay checkout modal → payment
        │
        ├─ verify-razorpay-payment  (redirect handler)  ┐ both verify the HMAC
        └─ razorpay-webhook         (server-to-server)  ┘ signature, then capture
        │
        ▼
enrolment created  →  access granted
        │
        ▼
post-capture step (_shared/postCapture.ts, at most once per order, single payments only):
server Meta Purchase (Conversions API) + receipt email with the invoice link
```

Captured is not the same as granted: verify writes `status = 'captured'` before it
inserts the enrolment, and can answer 500 in between. So the already-captured early
returns of both capture paths first grant the course if the buyer does not hold it
(`_shared/captureGrant.ts`, the same idempotent insert), and answer success only
after that. They never grant again a course this order granted and later lost (a
revoke, a refund). A cancelled or expired enrolment from the buyer's earlier order
does not block a new paid order. A free order (no Razorpay payment id, or a total of
0) skips this step: verify answers it `{ success: true, already_captured: true }` and
the status check answers it `captured`, both from the row alone, with no read of the
buyer's enrolments, because guest-create-order credits it to the typed phone's
account and any answer that read that account would tell a caller with no login what
the person owns. A grant they refuse
(course taken away, no buyer, a read or insert error) is written on the order as
`notes.grant_issue = { reason, source, at }`, and marked `resolved_at` once a later
grant works. The webhook acknowledges a refused grant only after that marker is on
the order; otherwise it answers 500 and Razorpay delivers again.

Both capture paths call `schedulePostCapture` (`_shared/postCaptureRuntime.ts`)
after their own work, and again from their already-captured early returns when
`notes.post_capture` is still empty and the order was captured in the last 48 hours
(`postCaptureRecoverable`), so a 500 between capture and the claim does not lose it
and an old order never gets a late receipt. Both that check and `runPostCapture`
also need a Razorpay payment id and a total above 0: a free order is written
captured at creation with no payment, and verify's already-captured return checks
no payment proof, so a free order's id alone must never queue a receipt. The first caller claims the order by
writing `payment_orders.notes.post_capture`; the other skips. That makes the step at
most once, not exactly once: a run that dies after its claim is not retried. Results
(Meta send, receipt) are recorded under that key, so a missing result shows which
step did not finish. Ad attribution from the checkout link (`utm_*` columns, the rest
in `notes.attribution`) is written by the two order functions at creation; see
`_shared/attribution.ts`.

**No second charge.** The checkout keeps the last order it opened a Razorpay
sheet for (`src/lib/checkoutOpenOrder.ts`, also in sessionStorage per offering)
until it is paid and verified. After Razorpay reports success but verify does not
confirm it, Pay stays locked and "Check payment status" runs the same verify call
again. After the sheet closes, the next Pay asks `verify-razorpay-payment` with
`status_check: true` (read-only: our row, then Razorpay's payments for the order,
`_shared/orderPaymentStatus.ts`) before anything new is charged; an unchanged
cart reopens the same Razorpay order. A captured single payment reads as
`captured` only when the buyer holds the course, and as `needs_review` until
then, so the checkout never says "Welcome" for a course nobody granted (a free
order reads as `captured` from the row). The guard
lives in one tab: a new tab, a fresh in-app browser or a second device does not see
it and can still start a second order. The browser Purchase goes out once per
`razorpay_payment_id` across the checkout and Thank-you (`src/lib/purchaseOnce.ts`).

**Pricing has ONE home: [`supabase/functions/_shared/pricing.ts`](supabase/functions/_shared/pricing.ts).**
`couponDiscountInr`, `gstInr`, `totalInr`, `toPaise`, `couponInvalidReason`. Used by
`create-razorpay-order`, `guest-create-order`, `validate-coupon`, and the frontend
preview (`hooks/useCheckoutPricing.ts`, via the `@shared` alias). Change pricing rules
there, once. Intentional difference: the public coupon preview and the guest path
discount the **base price only**; the signed-in order path discounts **price + bumps**.

The **frontend total is always a preview** — `verify-razorpay-payment` re-derives the
expected paise from `payment_orders.total_inr` before capturing, so a tampered client
cannot change what's charged.

**Guest buyers are identified by PHONE, once, in
[`supabase/functions/_shared/buyerIdentity.ts`](supabase/functions/_shared/buyerIdentity.ts)**
(`resolveOrCreateBuyer`): `find_login_identity` on the phone → the existing account is
used exactly as it is (nothing typed on the checkout form is ever written onto it); no
match → a new account with `phone_confirm` and the SYNTHETIC auth email, so phone-OTP
login lands on the purchase; the typed email goes on `public.users` only, and only for a
paid capture. No session is ever minted from payment proof: after verify the guest is sent
to `/login?next=/thank-you/<order>&phone=…` for one OTP (`src/lib/checkoutVerify.ts`,
`src/lib/loginParams.ts`). `verify-razorpay-payment`, `razorpay-webhook` and the free
path of `guest-create-order` all call the helper; receipts and the invoice PDF for a guest
order use the order's own guest fields, never a matched account's profile. The client
MUST send `is_guest` on the verify call.

---

## How login flows

`verify-msg91-otp` is the core. It (1) verifies the MSG91 widget access token, (2) binds
it to the phone via `phoneBinding` (rejects token-replay account-takeover), (3) looks the
user up by phone with the `find_login_identity` RPC — **not** GoTrue's broken `?phone=`
list filter, which silently misclassified the ~74k legacy users as new. Existing → login;
unknown phone matching a `legacy_enrolments` row → seamless legacy login; truly new →
signup. Guest checkout creates the auth user keyed on the typed phone with no OTP (see `_shared/buyerIdentity.ts`); the buyer proves the phone with one OTP on `/login` afterwards.

Phone + OTP-binding helpers live in [`supabase/functions/_shared/phone.ts`](supabase/functions/_shared/phone.ts)
(`normalizePhone`, `e164`, `last10`, `phoneVariants`, `syntheticEmail`, `phoneBinding`),
shared by `verify-msg91-otp` and `guest-create-order`.

---

## Shared, pure, dependency-free logic (`supabase/functions/_shared/`)

These files have **no imports** and run in both Deno (edge) and the Vite frontend (via the
`@shared` alias). Keep them pure — an import that exists in only one runtime breaks the other.

- `pricing.ts` — discount / GST / paise / coupon-validity math.
- `phone.ts` — phone normalisation + OTP phone-binding.
- `crypto.ts` — HMAC-SHA256 (hex for Razorpay, base64 for Tally) + timing-safe compare.
- `cors.ts`, `email.ts`, `email-templates/` — CORS headers + transactional email.

Unit tests for the pure logic live in `src/lib/__tests__/` (`npm test`).
