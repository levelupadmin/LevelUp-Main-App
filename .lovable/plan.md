

# Recurring Workshop — Ad-Driven Slot Assignment

## The Problem

You run separate Meta ads for Monday, Wednesday, and Sunday workshops. Each ad links to a landing page showing only that specific day. The customer buys impulsively thinking it's just "the Wednesday workshop." You don't want a slot picker — the day is already determined by which ad/landing page they came from.

## Solution: URL Parameter-Based Schedule Assignment

Instead of making the customer choose a slot post-purchase, **the landing page URL carries the schedule information**. The flow:

```text
Meta Ad (Wednesday) → Landing Page?schedule=wed-7pm → Buy Now → Payment → Auto-enroll with schedule_id for Wednesday
```

### How it works in the admin:

1. You create ONE course: "Screenwriting Workshop" with `is_recurring = true`
2. You add 3 schedules: Monday, Wednesday, Sunday
3. Each schedule gets a **unique shareable link / slug** (e.g., `screenwriting-workshop?slot=<schedule_id>`)
4. In the admin, each schedule row shows a "Copy Landing Page Link" button with the slot parameter baked in
5. You use that link in your Meta ads

### How it works for the customer:

1. Sees Wednesday ad → clicks → lands on `/course/screenwriting-workshop?slot=<wed-schedule-id>`
2. Landing page shows "Wednesday 7PM" prominently (pulled from the schedule data), no other slots visible
3. Clicks "Buy Now" → redirects to payment page (the `slot` parameter is passed through, either as a Razorpay custom field or stored in localStorage before redirect)
4. After payment confirmation, enrollment is created with `schedule_id = wednesday's ID`
5. In their dashboard, they only see Wednesday's Zoom link and Wednesday reminders

### What changes:

**Database**: Add a `slug` column to `course_schedules` so each slot has a unique identifier (e.g., `mon-7pm`, `wed-7pm`, `sun-10am`) — cleaner than exposing UUIDs in URLs.

**Admin UI (Schedule tab)**: Each schedule row gets:
- A `slug` field (auto-generated from day + time, editable)
- A "Copy Link" button that copies the full landing page URL with `?slot=<slug>`
- Display the payment page URL that will be used

**Course Detail page (student-facing)**: 
- Read `?slot=` from URL params
- If present, fetch that specific schedule and show only that slot's info (day, time)
- Pass the slot through to the payment flow
- If no slot param, show all available slots (fallback for organic traffic)

**Enrollment logic**: When creating an enrollment (after payment callback), use the slot parameter to set `schedule_id`.

### Implementation Steps:

1. **Migration**: Add `slug` column to `course_schedules` table
2. **Admin UI**: Update the Schedule tab in AdminCourses to show slug + copy link per schedule
3. **CourseDetail page**: Read `slot` query param, filter displayed schedule info accordingly, pass through to payment
4. **Enrollment creation**: Accept `schedule_id` based on the slot parameter

This approach means:
- ONE course, ONE payment page concept in the backend
- 3 different landing page URLs (same page, different `?slot=` param) for your 3 Meta ads
- Each student auto-assigned to their slot based on which ad they clicked
- Dashboard shows only their slot's Zoom link and reminders

