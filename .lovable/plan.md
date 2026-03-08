

# Admin Panel Overhaul — Unified Course System

## Understanding Your Requirements

You want to consolidate Content, Workshops, and Cohorts into a single unified "Course" system where everything — Masterclasses, Workshops, Cohorts — lives under one roof. Here's the full breakdown of what needs to be built:

---

## Data Model Design

The core idea: **one `courses` table with a `course_type` field** (`masterclass`, `workshop`, `cohort`) replaces three separate systems. Recurring workshops are handled by **schedules + slots**, not by creating multiple courses.

```text
┌─────────────────────────────────────────────────────┐
│                    courses                           │
│  (existing table + new columns)                      │
│  + course_type: masterclass | workshop | cohort      │
│  + payment_page_url (Razorpay link)                  │
│  + zoom_link                                         │
│  + is_recurring: boolean                             │
│  + recurrence_rule: jsonb (days, time, timezone)     │
│  + drip_enabled: boolean                             │
│  + drip_interval_days: integer                       │
│  + certificate_enabled: boolean                      │
│  + certificate_threshold: integer (e.g. 70)          │
│  + access_tags: text[] (e.g. ["screenwriting-bonus"])│
├─────────────────────────────────────────────────────┤
│                course_schedules                      │
│  id, course_id, day_of_week (0-6), start_time,      │
│  end_time, zoom_link (override), is_active           │
│  → For recurring workshops: Mon/Wed/Sun slots        │
├─────────────────────────────────────────────────────┤
│                enrollments                           │
│  id, user_id, course_id, schedule_id (nullable),     │
│  enrolled_at, completed_at, source_course_id         │
│  → schedule_id = which slot they picked (Wednesday)  │
│  → source_course_id = if granted via another course  │
├─────────────────────────────────────────────────────┤
│                lesson_progress                       │
│  id, user_id, lesson_id, course_id, status,          │
│  progress_pct, completed_at                          │
├─────────────────────────────────────────────────────┤
│                coupon_codes                           │
│  id, code, discount_type (percentage|fixed),         │
│  discount_value, max_uses, current_uses,             │
│  valid_from, valid_until, applicable_course_ids,     │
│  is_active, created_at                               │
├─────────────────────────────────────────────────────┤
│                certificates                          │
│  id, user_id, course_id, issued_at,                  │
│  certificate_url, completion_pct                     │
├─────────────────────────────────────────────────────┤
│                course_access_grants                  │
│  id, source_course_id, granted_course_id             │
│  → "If you buy course A, you also get course B"      │
├─────────────────────────────────────────────────────┤
│                notification_templates                │
│  id, course_id, trigger_type (reminder|completion),  │
│  channel (email|whatsapp), template_body,            │
│  hours_before (for reminders), is_active             │
├─────────────────────────────────────────────────────┤
│                scheduled_notifications               │
│  id, user_id, enrollment_id, template_id,            │
│  scheduled_for, sent_at, channel                     │
│  → Only sends to users enrolled in THEIR slot        │
└─────────────────────────────────────────────────────┘
```

---

## How the Recurring Workshop Problem Gets Solved

**Example: Screenwriting Workshop (Mon/Wed/Sun)**

1. You create ONE course: "Screenwriting Workshop" with `is_recurring = true`
2. You add 3 **schedules**: Monday 7PM, Wednesday 7PM, Sunday 10AM — each with its own zoom link
3. ONE payment page (Razorpay) links to this course
4. At checkout, the student picks their preferred slot (Wednesday)
5. Their `enrollment.schedule_id` = the Wednesday schedule
6. Reminders only fire for Wednesday enrollees before Wednesday's class
7. In the student portal, they only see the Wednesday schedule and zoom link

---

## Implementation Phases

### Phase A — Database Schema (Migration)
- Add `course_type` enum and new columns to `courses` table
- Create 6 new tables: `course_schedules`, `enrollments`, `lesson_progress`, `coupon_codes`, `certificates`, `course_access_grants`
- Create 2 notification tables: `notification_templates`, `scheduled_notifications`
- RLS policies on all tables

### Phase B — Unified Course Creator (Admin UI)
- Replace the current separate Content/Workshops/Cohorts admin pages with a single **"Courses"** page
- Course creation wizard with steps:
  1. **Type** — pick Masterclass, Workshop, or Cohort
  2. **Details** — title, description, thumbnail, instructor, category, tags
  3. **Schedule** — for workshops/cohorts: add recurring schedule slots (day, time, zoom link)
  4. **Content** — modules and lessons (same as current AdminContent)
  5. **Pricing & Payment** — price, payment page URL, coupon codes
  6. **Settings** — drip release config, certificate threshold, access tags (cross-course grants)
- Existing course list view with filters by type and status

### Phase C — Coupon Code Manager
- Admin page section to create/edit/deactivate coupon codes
- Set discount type (% or fixed), max uses, validity dates, applicable courses
- Validate coupons at checkout

### Phase D — Certificate Generator
- Admin toggle per course: enable certificates + set completion threshold
- Edge function that checks `lesson_progress` against threshold
- Auto-generates a certificate (PDF or image) and emails it
- Stores record in `certificates` table

### Phase E — Drip Release
- Admin toggle per course: enable drip + set interval (e.g. 7 days)
- Lessons have `sort_order`; student can only access lesson N if enrolled_at + (N × interval_days) has passed
- Backend logic in the lesson access query

### Phase F — Access Tags / Cross-Course Grants
- Admin UI: on a course, add "also grants access to" → pick other courses
- `course_access_grants` table: source_course_id → granted_course_id
- When a student enrolls in course A, auto-create enrollment for course B

### Phase G — Email & WhatsApp Automation
- Admin UI: per-course notification templates (reminder before class, completion congrats, certificate)
- Edge function (cron-triggered) that:
  - Queries upcoming schedules + enrolled users (filtered by their schedule_id)
  - Sends reminders only to users enrolled in THAT specific slot
  - Channels: Email (Lovable auth email or Resend) and WhatsApp (requires WhatsApp Business API integration — will need a connector or API key)

### Phase H — Sidebar & Routing Cleanup
- Consolidate admin nav: remove separate "Workshops" and "Cohorts" links
- Single "Courses" section covers all three types
- Keep "Moderation", "Users", "Analytics", "Settings" as-is

---

## Technical Notes

- **Payment integration**: You mentioned Razorpay. Lovable has a built-in Stripe integration. For Razorpay, we'd need to store the API key as a secret and build a custom edge function. We can start with just storing the payment page URL and linking it, then integrate Razorpay checkout later.
- **WhatsApp automation**: Requires a WhatsApp Business API provider (e.g. Twilio, Gupshup). We'll need API credentials stored as secrets. Can be implemented as an edge function.
- **Certificate PDF generation**: Can be done via an edge function using a template approach (HTML → image/PDF).
- **Existing `courses` table**: We'll ALTER it to add new columns rather than recreate, preserving existing data.

---

## Suggested Build Order

| Step | What | Depends On |
|------|------|------------|
| 1 | Database migration (all new tables + columns) | Nothing |
| 2 | Unified course creator UI (type picker + schedule slots) | Step 1 |
| 3 | Course list/edit view | Step 2 |
| 4 | Coupon code manager | Step 1 |
| 5 | Drip release logic | Step 1 |
| 6 | Access tags / cross-course grants | Step 1 |
| 7 | Certificate generator | Steps 1, 5 |
| 8 | Email & WhatsApp automation | Steps 1, 2 |

This is a large scope. I'd recommend starting with **Steps 1-3** (database + unified course creator + list view) as the foundation, then layering on features.

