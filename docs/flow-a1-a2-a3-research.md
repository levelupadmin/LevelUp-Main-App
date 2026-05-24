# A1 / A2 / A3 — Mobbin research + recommendations

**Date:** 2026-05-24
**Reference set:** 9 Mobbin queries spanning iOS + web across CRED, Notion,
MasterClass, Skillshare, Bumble, Contra, GoFundMe, Retool, Fresha,
Booking.com, Synthesia, Jasper, Airbnb, The New Yorker, Shop, Typeform,
Shopify, Unity, Eventbrite, GoodRx, Gopuff, Swiggy, Everyday Rewards,
Ladder, Gojek.

Use this doc as the source of truth when we work each flow. Each flow
section ends with a **next pass** that is concrete enough to implement.

---

## A1 — Authentication

### Reference highlights
- **CRED (iOS)**: Serif headline "enter the OTP sent to <number>", small
  Resend OTP link, sticky terms/privacy footer, single black Proceed
  button. Premium, club-membership feel.
- **Notion (web)**: Single screen — Continue with Google/Apple/Microsoft
  stack, email field, code reveal-on-submit, resend-in-25s counter.
  Reduces drop-off vs the two-page pattern.
- **MasterClass (iOS)**: Social-first ("Continue with Apple/Google/
  Facebook") with email as fallback. Onboarding includes a soft "What
  brings you to this class?" profile step.

### Our current state
- `src/pages/Login.tsx`, `src/pages/Signup.tsx`
- Phone OTP via MSG91 widget for +91 numbers; email magic link for
  non-+91. No password. No social.
- Two separate routes for login vs signup with mostly identical layout.

### Recommended changes (ranked by impact)
1. **Merge `/login` and `/signup` into a single screen** with
   reveal-on-submit code field. The Notion pattern. Saves a route, cuts
   drop-off, matches modern expectations. Our auth backbone supports it
   with no DB or edge function changes.
2. **Editorial typography pass** on the OTP entry — serif italic
   headline pulling our Instrument_Serif from the design system, eyebrow
   above ("Membership", "Welcome back"), sticky terms+privacy in the
   footer. Aligns the auth flow with the cinematic PublicOffering hero.
3. **Resend countdown + masked number display**. Today users hammer
   Resend thinking the SMS is lost; a "Resend in 25s" stops that.
4. **Desktop right-column visual** — a portrait stack of our instructors
   (Lokesh / Nelson / Karthick / Ravi) as a reminder of who they're
   signing in for. Doesn't show on mobile.
5. **Skip social sign-in for now.** Big surface, low marginal lift for
   our Indian-mobile-first audience where phone OTP is already the
   familiar pattern. Revisit if we see drop-off data say otherwise.

### Next pass shopping list
- Single combined `Auth.tsx` route handling phone + email + OTP all in
  one screen
- Sticky `<TermsFooter />` component
- Resend countdown hook
- Optional desktop hero column

---

## A2 — Discovery (PublicOffering + Browse)

### Reference highlights
- **MasterClass class detail (web)**: side-by-side hero — portrait
  image left, serif headline + body + Start/Trailer/Remind buttons
  right. Below: 4-tile outcome grid with one tile circled in a
  doodle to direct the eye.
- **MasterClass landing (web)**: instructor mosaic in the hero, email
  collect inline, category pill row, "Learn from the world's best"
  6-portrait grid with SEE ALL overflow.
- **MasterClass iOS class detail**: full-bleed portrait hero with
  white serif name and "Teaches X" subtitle, huge red PLAY LESSON 1
  primary CTA, tab switcher (Lessons / Overview).
- **Skillshare reviews**: aggregated rating cards — "Best Suited For
  Beginner", "Most Liked" tag list, "Expectations Met" horizontal bar
  chart with %s. Way richer than a star average.

### Our current state
- `src/pages/PublicOffering.tsx` — already strong. Cinematic hero,
  outcome tile grid (just shipped), Instructor card, Highlights,
  description, What you'll learn rail, Curriculum accordion,
  Instructor bio, Testimonials, FAQs, sticky CheckoutCard.
- `src/pages/BrowsePage.tsx` — list view, visually behind everything
  else in the app.

### Recommended changes (ranked by impact)
1. **Inline trailer / free preview player on PublicOffering.** Every
   Masterclass class detail has the trailer playable above the fold.
   We have `make_free` on chapter 1 of every course (the Welcome
   episode). Pulling that into a VdoCipher player above the curriculum
   would let prospects taste before buying — almost certainly the
   single highest-impact conversion lever.
2. **Trailer button paired with the buy CTA** in the hero. Today we
   have one CTA; Masterclass always offers Trailer + Buy side-by-side.
3. **Aggregated reviews block** above the long testimonial list:
   "Most Liked: Clear instruction · Production quality · Real
   examples" tag row, "Expectations Met: 94% Exceeded" horizontal bar.
   Hand-curated for v1; can layer the data behind it later.
4. **`BrowsePage` rebuild** to match the MasterClass landing structure:
   eyebrow + serif headline, category pills, instructor portrait grid
   (6 + SEE ALL). We have 7 masterclasses — perfect for the layout.
5. **Doodle ring on the outcome tile** — pick the most impressive
   stat per course (lessons, hours, language coverage) and draw a
   hand-sketched ring SVG around it. Low effort, high attention pull.
6. **Sticky bottom checkout bar mobile typography** — price as the
   loudest element. Currently legible but understated.

### Next pass shopping list
- New `FreePreviewPlayer` component on `PublicOffering.tsx` that
  embeds VdoCipher for the first `make_free` chapter
- "Watch free preview" button in the hero action row
- `AggregatedReviews` component (hand-curated tags for v1)
- `BrowsePage.tsx` ground-up rebuild
- Decorative `<DoodleRing />` SVG component

---

## A3 — Purchase (Checkout + Thank You)

### Reference highlights
- **Stripe/Synthesia/Retool**: Two-column checkout — payment form
  left, order summary right with inline coupon + live total
  recalculation. Tabs at top for Card / PayPal / Bank.
- **GoFundMe**: Radio between PayPal / Credit-or-debit; expands to
  reveal the right form. Less visually noisy than tabs.
- **Shop/Shopify**: Applied-coupon chips with × to remove, "TOTAL
  SAVINGS" line, "Order is free. No payment required." celebratory
  state when 100% off.
- **Booking.com**: Promo code as its own card below payment, CVC
  tooltip image (dated but functional).
- **Eventbrite (iOS)**: Order Complete + See you at the event +
  add-to-calendar + share + Follow + View your ticket primary CTA.
- **Gopuff (iOS)**: Status timeline (Confirmed / Pack / Drive /
  Deliver) with progress dots and "Delivered!" headline.
- **Ladder (iOS)**: "IT'S OFFICIAL" giant text + green checkmark
  sphere + "Welcome to the Ladder Team" — emotional close.
- **Swiggy / Gojek / Everyday Rewards (iOS)**: Confetti is the
  universal celebratory anchor on completion screens.

### Our current state
- No standalone checkout page in most cases — `PublicOffering.tsx`'s
  `CheckoutCard` triggers a Razorpay modal directly. The user goes
  PublicOffering → Razorpay popup → `/thank-you/<paymentOrderId>`.
- `ThankYou.tsx` recently redesigned: pulsing emerald halo + checkmark
  + "You're in." headline + benefit chips + cream Start Watching CTA
  + IST mono footer.
- Coupon is a single input + Apply on `CheckoutCard`. Discount line
  appears in the price summary when valid.

### Recommended changes (ranked by impact)
1. **Pre-checkout review screen** at `/checkout/<offeringId>`. Today
   we jump straight to Razorpay's popup. A brief review screen (left:
   name/email/phone confirm + coupon + price breakdown; right: order
   summary with course thumb and instructor) reduces accidental
   double-clicks and is the universal pattern for paid digital
   products at this price point.
2. **Applied-coupon chip + savings line** on the order summary. Shop
   pattern — chip with × to remove, "TOTAL SAVINGS: ₹X" line, and a
   joyful empty-state when 100% off ("Your masterclass is free —
   complete order to start watching").
3. **`ThankYou.tsx` push**:
   - WhatsApp Share button pre-filled with the offering URL — Indian
     audience moves on WhatsApp
   - Add-to-Calendar button when the offering has cohort dates
   - "We've emailed your receipt to <email>" trust line
   - Order timeline visual (Payment ✓ → Account ✓ → Start watching →
     Get certificate)
4. **Bigger celebration moment.** Our checkmark + halo is restrained.
   Ladder ("IT'S OFFICIAL"), Swiggy (confetti), Gojek (huge tick) all
   go bigger. We have Confetti.tsx already — adding a 2-3 second
   confetti burst on first mount is one line.
5. **Express checkout row** (UPI / Google Pay / Razorpay one-tap) at
   the top of the review screen — Indian-market parallel to Stripe's
   Shop Pay / Apple Pay row. Reduces card-entry friction; Razorpay
   already supports it.

### Next pass shopping list
- New `/checkout/<offeringId>` route with `CheckoutReview` component
- Coupon chip UI with × remove + savings line in the order summary
- ThankYou WhatsApp share, calendar add, email-receipt trust line,
  timeline visual
- Optional confetti burst on first mount (Confetti.tsx already
  exists)
- Express checkout (UPI / GPay / one-tap) row

---

## Working order

Given conversion impact, my recommendation:

1. **A2.1 + A2.2 — Inline free preview player + Trailer button on
   PublicOffering.** Single highest-leverage change in the entire
   app. Sample-before-buy is the proven course-marketplace pattern
   and we have the data + RLS infrastructure for it.
2. **A3.1 — Pre-checkout review screen.** Tightens the payment
   funnel; sets us up for express checkout later.
3. **A1.1 — Combined login/signup with reveal-on-submit code.**
   Cuts the first-touch drop-off in half on paper.
4. **A2.3 — Aggregated reviews block.**
5. **A3.3 — ThankYou push (WhatsApp share, timeline, receipt
   confirmation).**
6. **A2.4 — BrowsePage rebuild.**
7. The remaining items can be picked up in any order based on
   what we observe on prod once the above land.
