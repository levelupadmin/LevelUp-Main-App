# LevelUp Main App — Flow Map

**Last updated:** 2026-05-23
**Purpose:** A Mobbin-style breakdown of every user-facing flow in the
app, organized by user goal. We'll work through these one flow at a time
to polish each to launch quality.

A **flow** is a sequence of screens that together accomplish a single
user goal (e.g. "buy a masterclass"). A **screen** is a single page or
modal. **Notable states** are visual variations of a screen that exist
in code (loading, empty, error, unlocked vs locked, etc.) — these are
what Mobbin curates separately because each is its own design problem.

Routes that aren't grouped under a goal (404, /privacy, /terms,
/refunds, /delete-account) are listed at the end under "Static / legal".

The marketing site at `leveluplearning.in` is a separate repo
(`levelupnewsite`) and not enumerated here.

---

## A. Student-facing flows

### A1. Authentication
**Purpose:** Get the user logged in (existing) or signed up (new) before
they can buy or watch.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Login | `/login` | `Login.tsx` | Phone OTP via MSG91 widget for +91 numbers; email magic link for non-+91. No password. |
| 2 | Signup | `/signup` | `Signup.tsx` | Same auth backbone as Login; collects name + phone/email. |
| 3 | OTP entry | (inline modal) | MSG91 widget | Renders inside Login/Signup. Six-digit code, resend, change-number. |
| 4 | Root redirect | `/` | `RootRedirect.tsx` | Decides where to send a returning visitor based on auth + role. |

**Notable states:**
- Anon visitor on a `/chapters/<id>` deep link → bounced here, deep link preserved for post-login redirect
- Existing email user attempts signup → "use login instead" hint
- MSG91 widget script fails to load → falls back to email magic link

**Entry points:** marketing site CTAs, PublicOffering "Sign in" button,
RequireAuth guard from any authed route.

---

### A2. Discovery
**Purpose:** Browse what LevelUp offers; decide what to buy or sample.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Public offering (marketing/buy page) | `/p/<slug>` | `PublicOffering.tsx` | The big one. Hero, outcome tile grid, instructor card, highlights, description, **What you'll learn** rail, Curriculum accordion, instructor bio, testimonials, FAQs, sticky checkout. Anonymous-readable via RLS. |
| 2 | Browse | `/browse` | `BrowsePage.tsx` | Logged-in catalog. Lists all offerings; tabs/categories. |

**Notable states:**
- PublicOffering with no instructor avatar → letter fallback
- PublicOffering for free vs paid → different CTA copy
- PublicOffering loading → skeleton
- Browse with zero enrolments → "Start your first masterclass"

**Entry points:** marketing site, Home → "Browse", direct shareable URL
(now the chapter Share button drops you here).

---

### A3. Purchase
**Purpose:** Convert a buyer from intent → owned access.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Checkout | `/checkout/<offeringId>` *or inline* | `CheckoutPage.tsx` + `CheckoutCard` (on PublicOffering) | Razorpay popup. Coupon application. Captures name/email/phone if missing. |
| 2 | Thank you | `/thank-you/<paymentOrderId>` | `ThankYou.tsx` | Recently redesigned: pulsing checkmark, benefit chips, cream Start Watching CTA, mono order/payment IDs. Auto-redirect option. |
| 3 | Application status | `/my-application/<applicationId>` | `ApplicationStatus.tsx` | For cohort-style offerings that require a written application before purchase. |

**Notable states:**
- Coupon valid → discount panel
- Coupon invalid → inline error
- Razorpay popup dismissed → revert button state
- Payment captured but webhook still processing → "we'll send a confirmation" interstitial
- Application pending review → ApplicationStatus shows "under review"
- Application approved → ApplicationStatus shows "pay now" CTA

**Entry points:** PublicOffering "Enrol now", Home → BrowsePrograms,
inbound email from accepted application.

---

### A4. Library & dashboard
**Purpose:** Pick up where you left off; see what you own.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Home (authed dashboard) | `/home` | `Home.tsx` | Cinematic Resume hero, Continue Learning rail, Popular in Community, Upcoming Events, Upcoming Live Sessions, Browse Programs, New Members (admin-only). |
| 2 | My Courses | `/my-courses` | `MyCoursesPage.tsx` | Owned content grid. |
| 3 | Course detail | `/courses/<courseId>` | `CourseDetail.tsx` | Course overview, section/chapter list, progress, certificate eligibility. |

**Notable states:**
- Home with no enrolments → greeting card fallback (no cinematic hero)
- Home with active enrolment but zero progress → "Start watching" CTA
- Home with progress → "Resume watching" CTA with progress bar
- Course detail with locked chapters → padlock + Enrol nudge
- Course detail 100% complete → "Get your certificate" celebration

**Entry points:** RootRedirect for authed users, Thank you's "Start
watching", bottom-tab Home.

---

### A5. Watching
**Purpose:** Consume the actual masterclass content; the core value
loop.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Chapter viewer | `/chapters/<chapterId>` | `ChapterViewer.tsx` | The recently-redesigned page. VdoCipher player, Lesson eyebrow + title, Share + Mark complete actions, dot-strip progress, Prev/Next nav. |
| 2 | Right sidebar tabs | (same route) | `ChapterViewer.tsx` | 5 tabs: Up Next, Notes, Overview, Files, Q&A. Sidebar header shows course context + counter. |

**Notable states:**
- Player loading OTP from VdoCipher
- Player error (access denied, rate-limited, network)
- Chapter marked complete → green Completed tag replaces CTA
- Last chapter in course → completion banner with confetti
- Quiz attached → QuizBlock below content
- Notes hydrating (DB fetch in progress) → empty Notes tab momentarily
- Up Next has thumbnails (admin populated) vs numbered fallback

**Entry points:** Home Resume hero, Continue Learning card, Course detail
chapter list, direct deep link.

---

### A6. Live sessions
**Purpose:** Attend instructor-led live classes and cohort sessions.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | My sessions | `/my-sessions` | `MySessionsPage.tsx` | Upcoming + past live sessions for the user's cohorts. |

**Notable states:**
- Session "Join" gate (Zoom link only revealed within window before start time, via `get_live_session_zoom_link` RPC)
- Session in progress → "Joining…" with countdown
- Session ended → recording link (when available)

**Entry points:** Home UpcomingSessions strip, calendar invites sent
via email queue.

---

### A7. Events
**Purpose:** One-off paid or free events outside the masterclass model
(workshops, alumni meets, in-person screenings).

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Events list | `/events` | `EventsPage.tsx` | Cards for upcoming events. |
| 2 | Event detail | `/events/<eventId>` | `EventDetail.tsx` | Date/time, location, paid/free, registration CTA, Razorpay path for paid. |

**Notable states:**
- Event sold out → registration disabled
- Event paid, user already registered → "You're in"
- Event in-person → MapPin location vs online → Globe URL
- Event registration pending Razorpay verification → interstitial

**Entry points:** Home UpcomingEvents strip, marketing email.

---

### A8. Community
**Purpose:** Threaded discussion across all students.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Community feed | `/community` | `CommunityPage.tsx` | Q&A posts (qna_posts table), sortable by recent/popular. |

**Notable states:**
- Empty feed → "Be the first to post"
- Post with instructor reply → "Answered" badge
- User's own post pending answer

**Entry points:** Home PopularCommunity strip, bottom-tab Community.

> Per-chapter Q&A is **inside** the watching flow (A5) as a sidebar tab,
> not here. They use a different table (`chapter_qna`) and don't cross
> over.

---

### A9. Profile & account
**Purpose:** Manage personal info; meet Google Play account-deletion
compliance.

| # | Screen | Route | Component | Notes |
|---|---|---|---|---|
| 1 | Profile | `/profile` | `ProfilePage.tsx` | Avatar, name, bio, occupation, city; sign-out. |
| 2 | Delete account (public, no login) | `/delete-account` | `DeleteAccount.tsx` | Required by Google Play. Submits an account_deletion_requests row; 7-day soft-delete grace via cleanup_deleted_users(). |

**Notable states:**
- Profile save → optimistic update with toast
- Profile avatar upload mid-flight
- Delete account submitted → "We'll process your request in 7 days"
- Account in soft-delete window → user appears logged out (RLS hides their row)

**Entry points:** Profile button, marketing site footer link.

---

### A10. Static / legal
**Purpose:** Policy pages required for Razorpay + Play Store +
trust-builder.

| Screen | Route | Component |
|---|---|---|
| Privacy policy | `/privacy` | `PrivacyPolicy.tsx` |
| Terms of service | `/terms` | `Terms.tsx` |
| Refund policy | `/refunds` | `RefundPolicy.tsx` |
| 404 | `*` | `NotFoundPage.tsx` |

---

## B. Admin flows

> Admin pages are role-gated via `RequireRole role="admin"`. Owner has
> the same access plus owner-only protections.

### B1. Admin home
- `/admin` — `AdminDashboard.tsx` — top-line metrics
- `/admin/hero-slides` — `AdminHeroSlides.tsx` — Home carousel
- `/admin/audit-logs` — `AdminAuditLogs.tsx` — admin action history

### B2. Content management
- `/admin/courses` — `AdminCourses.tsx` — list
- `/admin/courses/<id>/edit` — `AdminCourseEditor.tsx` — course metadata (title, thumb, instructor, hero, durations, FAQs, outcomes, portfolio)
- `/admin/courses/<id>/curriculum` — `AdminCourseCurriculum.tsx` — sections + chapters; per-chapter: VdoCipher ID, custom thumbnail, duration (auto-fetched), make_free, watermark
- `/admin/courses/<id>/preview` — `AdminCoursePreview.tsx` — admin's-eye view of the course detail
- `/admin/courses/<id>/preview/<chapterId>` — `AdminChapterPreview.tsx` — preview chapter as student would see it
- `/admin/courses/<id>/reviews` — `AdminCourseReviews.tsx` — moderate reviews
- `/admin/courses/<id>/chapters/<chapterId>/quiz` — `AdminQuizEditor.tsx` — quiz CRUD
- `/admin/courses/<id>/certificate` — `AdminCertificateTemplateEditor.tsx` — certificate template

### B3. Catalog
- `/admin/offerings` — `AdminOfferings.tsx`
- `/admin/offerings/<id>/edit` — `AdminOfferingEditor.tsx` — pricing, hero, instructor card, testimonials, primary_offering_id, etc.
- `/admin/coupons` — `AdminCoupons.tsx`

### B4. People
- `/admin/users` — `AdminUsers.tsx`
- `/admin/roles` — `AdminRoles.tsx` — role assignment with owner protections
- `/admin/enrolments` — `AdminEnrolments.tsx`
- `/admin/applications` — `AdminApplications.tsx` — review cohort applications

### B5. Operations
- `/admin/schedule` — `AdminSchedule.tsx` — live session calendar
- `/admin/events` — `AdminEvents.tsx`
- `/admin/announcements` — `AdminAnnouncements.tsx`

### B6. Revenue & certificates
- `/admin/revenue` — `AdminRevenue.tsx`
- `/admin/certificates` — `AdminCertificates.tsx`

### B7. Marketing
- `/admin/email-templates` — `AdminEmailTemplates.tsx`
- `/admin/email-campaigns` — `AdminEmailCampaigns.tsx`

### B8. Community ops
- `/admin/community` — `AdminCommunityAnalytics.tsx`

---

## C. Instructor flow
- `/instructor` — `InstructorDashboard.tsx` — placeholder for now (revenue share view, course performance). Will get more love post-launch.

---

## Suggested order to work through these

In rough order of buyer-impact and how often the screen is seen on the
critical path:

1. **A5 Watching** — the core product loop, just got a major redesign, worth a polish + real-device QA pass before launch.
2. **A2 Discovery (PublicOffering)** — the conversion page; recently redesigned with outcome tiles + What-you'll-learn rail. One more polish pass + Lighthouse perf check.
3. **A1 Authentication** — MSG91 is still branded "DSHOTP-S" in the SMS sender; would land cleaner with our DLT template. Not blocking, but visible to every new user.
4. **A4 Library & dashboard** — cinematic Resume hero is implemented but needs prod verification with a real session; might want a few micro-states (just-purchased no-progress, course-just-completed, etc.).
5. **A3 Purchase** — pretty mature already; coupon edge cases worth a sweep.
6. **A6 Live sessions** & **A7 Events** — feature-complete but visually plainer than the rest of the app; would benefit from the same card visual language Home now uses.
7. **A9 Profile & account** — minimal scope, just needs to look not-ugly.
8. **A8 Community** — lowest priority; product hypothesis still unproven, don't over-invest.
9. **Admin flows** — internal-only; ergonomics over polish. Worth a separate pass after launch.

For each flow, the typical pass would be: pull Mobbin references for
analogous patterns, audit our current state at all the notable-states
listed, propose specific changes with file paths, ship + verify.
