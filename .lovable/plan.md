

# Full Razorpay Checkout Integration

## Overview
Embed Razorpay's checkout widget directly in the app. When a user clicks "Pay", a backend function creates a Razorpay order, the frontend opens the Razorpay modal, and a webhook automatically enrolls the user after successful payment.

## Architecture

```text
User clicks Pay → Edge Function creates Razorpay Order → Razorpay modal opens in-app
                                                              ↓
                                                         User pays
                                                              ↓
Razorpay webhook → Edge Function verifies signature → Creates enrollment + marks payment
```

## What's Needed

### 1. Secrets (before any code)
- `RAZORPAY_KEY_ID` — your Razorpay API key (starts with `rzp_`)
- `RAZORPAY_KEY_SECRET` — your Razorpay secret key
- `RAZORPAY_WEBHOOK_SECRET` — webhook secret from Razorpay dashboard

### 2. Database: `payments` table
Tracks payment attempts and status:
- `id`, `user_id`, `course_id`, `razorpay_order_id`, `razorpay_payment_id`, `amount`, `currency`, `status` (pending/paid/failed), `created_at`
- RLS: users read own, admins read all

### 3. Edge Function: `create-razorpay-order`
- Receives `course_id` from authenticated user
- Looks up course price from DB
- Calls Razorpay Orders API to create an order
- Inserts a `payments` row with status "pending"
- Returns `order_id`, `amount`, `key_id` to frontend

### 4. Edge Function: `razorpay-webhook`
- Receives POST from Razorpay with payment event
- Verifies webhook signature using `RAZORPAY_WEBHOOK_SECRET`
- On `payment.captured`: updates payment status to "paid", creates enrollment
- No JWT verification (external webhook)

### 5. Frontend: Update `Checkout.tsx`
- Load Razorpay Checkout.js script dynamically
- On "Pay Now" click: call `create-razorpay-order`, then open Razorpay modal with returned order details
- On payment success callback: navigate to `/enrollment-success/:slug`
- Free courses continue with existing instant enrollment flow
- Add `VITE_RAZORPAY_KEY_ID` to frontend (public key, safe to expose)

### 6. Admin: Payment link field (already exists)
The `payment_page_url` field on courses is already available as a fallback. No admin changes needed — the system uses the course `price` field directly.

## Files to Create/Modify
- **Migration**: Create `payments` table with RLS
- **`supabase/functions/create-razorpay-order/index.ts`** — new edge function
- **`supabase/functions/razorpay-webhook/index.ts`** — new edge function
- **`src/pages/Checkout.tsx`** — add Razorpay modal flow for paid courses, keep free flow
- **`index.html`** — add Razorpay Checkout.js script tag

## Setup Steps (for you)
1. Create a Razorpay account at razorpay.com
2. Get your API keys from Settings → API Keys
3. Set up a webhook in Razorpay Dashboard → Settings → Webhooks pointing to your edge function URL, with event `payment.captured`

