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
| **Admin** | `pages/admin/*` (37 pages), `components/admin/` | `admin-api`, `send-bulk-email`, `send-notification` |
| **Email / notifications** | `components/notifications/`, `hooks/useNotifications.ts` | `queue-transactional-email`, `process-email-queue`, `_shared/email-templates/` |

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
```

**Pricing has ONE home: [`supabase/functions/_shared/pricing.ts`](supabase/functions/_shared/pricing.ts).**
`couponDiscountInr`, `gstInr`, `totalInr`, `toPaise`, `couponInvalidReason`. Used by
`create-razorpay-order`, `guest-create-order`, `validate-coupon`, and the frontend
preview (`hooks/useCheckoutPricing.ts`, via the `@shared` alias). Change pricing rules
there, once. Intentional difference: the public coupon preview and the guest path
discount the **base price only**; the signed-in order path discounts **price + bumps**.

The **frontend total is always a preview** — `verify-razorpay-payment` re-derives the
expected paise from `payment_orders.total_inr` before capturing, so a tampered client
cannot change what's charged.

---

## How login flows

`verify-msg91-otp` is the core. It (1) verifies the MSG91 widget access token, (2) binds
it to the phone via `phoneBinding` (rejects token-replay account-takeover), (3) looks the
user up by phone with the `find_login_identity` RPC — **not** GoTrue's broken `?phone=`
list filter, which silently misclassified the ~74k legacy users as new. Existing → login;
unknown phone matching a `legacy_enrolments` row → seamless legacy login; truly new →
signup. Guest checkout mints the auth user from name/email/phone with no OTP.

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
