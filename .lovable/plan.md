# Full App Audit — Broken Functionality and Admin Control Gaps

## Summary

The app has a mix of **mock-data-only screens** (no backend), **backend-connected screens missing admin controls**, and **frontend features with no way for admins to manage the content that appears**. Below is every gap, organized by severity. 

---

## CATEGORY 1: Frontend Screens Running on Mock Data (No Backend at All)

These screens show hardcoded data from `src/data/` files. Students see content that admins cannot create, edit, or remove.


| Screen                                        | Mock Source                                            | What's Missing                                                                      |
| --------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Home — Hero Carousel**                      | `HeroCarousel.tsx` hardcoded slides                    | No admin panel to manage banner slides, images, CTAs, or links                      |
| **Home — Upcoming Events**                    | `UpcomingEvents.tsx` hardcoded array                   | No events/workshops table; no admin CRUD for events                                 |
| **Home — Streak Card**                        | `userProfile.streak` from `mockData.ts`                | No `streaks` table; no gamification backend                                         |
| **Home — Continue Learning**                  | `detailedCourses` from `learningData.ts`               | Uses mock courses instead of real enrollments (the `/learn` page does it correctly) |
| **Home — Community Posts**                    | `communityPosts` from `mockData.ts`                    | Should pull from `community_posts` table instead                                    |
| **Home — Featured Creators**                  | `featuredCreators` from `mockData.ts`                  | No admin control to feature/unfeature creators                                      |
| **Workshops listing**                         | `workshopsList` from `learningData.ts`                 | Entirely mock; should use `courses` table with `course_type='workshop'`             |
| **Workshop Detail**                           | `WorkshopDetail.tsx` uses mock data                    | No backend connection                                                               |
| **Cohort Detail / Apply / Dashboard**         | `cohortData.ts`                                        | Entirely mock; cohorts exist in `courses` table but detail pages don't use it       |
| **Opportunities**                             | `opportunitiesData.ts`                                 | No `opportunities` table exists in database                                         |
| **Opportunity Detail / Post**                 | Mock data                                              | No backend                                                                          |
| **Admin Dashboard**                           | `adminData.ts` — `dashboardStats`, `revenueData`, etc. | All stats are hardcoded; should aggregate from real tables                          |
| **Admin Users**                               | `mockAdminUsers` from `adminData.ts`                   | Uses mock user list instead of querying `profiles` + `user_roles`                   |
| **Admin Moderation**                          | `mockFlaggedItems` from `adminData.ts`                 | No `reports`/`flags` table in database                                              |
| **Admin Analytics**                           | `adminData.ts` charts                                  | All chart data is hardcoded                                                         |
| **Admin Opportunities**                       | `mockAdminOpportunities` from `adminData.ts`           | No backend table                                                                    |
| **Admin Settings**                            | `defaultPlatformSettings` local state                  | Settings not persisted; no `platform_settings` table                                |
| **Explore page**                              | Placeholder only                                       | Empty page                                                                          |
| **Notifications**                             | Placeholder only                                       | No notifications feed; `scheduled_notifications` table exists but nothing reads it  |
| **Search**                                    | Unknown                                                | Likely placeholder                                                                  |
| **Subscription**                              | Unknown                                                | Likely placeholder                                                                  |
| **Community — Spaces/Discover/Creators tabs** | `communityData.ts` mock arrays                         | Spaces list uses mock; only Feed tab is partially wired to backend                  |


---

## CATEGORY 2: Backend Exists but Admin Cannot Control Frontend Content

These features have database tables, but no admin UI to manage what students see.


| Feature                       | DB Table                  | Admin Gap                                                                                                                 |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Hero banners on home page** | None                      | Need a `banners` table + admin CRUD                                                                                       |
| **Community Spaces**          | `community_spaces`        | Spaces exist in DB but community pages use mock `cohortCommunities`, `cityCommunities`, `skillCommunities` arrays instead |
| **Community Channels**        | `community_channels`      | Channels exist in DB but channel sidebar may use mock data in some views                                                  |
| **Course Schedules**          | `course_schedules`        | Table exists, admin builder has no Schedule tab anymore (was removed during refactor)                                     |
| **Course Resources**          | `course_resources`        | Table exists, no admin UI to manage per-course downloadable resources                                                     |
| **Lesson Resources**          | `lesson_resources`        | Table exists, no admin UI to attach resources to lessons                                                                  |
| **Notification Templates**    | `notification_templates`  | Table exists, no admin UI to create/edit email/push templates                                                             |
| **Scheduled Notifications**   | `scheduled_notifications` | Table exists, no admin UI and no student-facing notification feed                                                         |
| **Certificates**              | `certificates`            | Table exists, course has `certificate_enabled` flag, but no admin UI to view/revoke issued certificates                   |
| **Course Access Grants**      | `course_access_grants`    | Table exists (cross-course access), no admin UI                                                                           |
| **Pricing Variants**          | `course_pricing_variants` | Admin Sales Pages manages these, but Course Builder Information tab doesn't show them                                     |


---

## CATEGORY 3: Broken or Incomplete Functionality


| Issue                                               | Details                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Home page "Continue Learning" uses mock data**    | `Index.tsx` imports `detailedCourses` from `learningData.ts` and filters by `progress > 0`. Meanwhile `/learn` correctly queries enrollments from Supabase. Home page will never show real enrolled courses. |
| **Duplicate `/profile/:handle` route**              | Line 105-106 in `App.tsx` — same route declared twice                                                                                                                                                        |
| **Workshops page has no backend**                   | Uses `workshopsList` mock array. Workshops are just `courses` with `course_type='workshop'` but the Workshops page doesn't query the DB                                                                      |
| **WorkshopDetail page likely uses mock data**       | Students see fake workshop content                                                                                                                                                                           |
| **Cohort pages fully mock**                         | `CohortDetail`, `CohortApplication`, `CohortDashboard` all use `cohortData.ts`. Cohorts in `courses` table are never used by these pages                                                                     |
| **Admin Users page uses mock data**                 | `AdminUsers.tsx` uses `mockAdminUsers` — role changes, suspend/ban actions don't persist                                                                                                                     |
| **Admin Moderation uses mock data**                 | No `reports` or `flagged_items` table; actions don't persist                                                                                                                                                 |
| **Admin Dashboard stats are fake**                  | All numbers from `adminData.ts`; should count from real tables                                                                                                                                               |
| **Admin Settings don't save**                       | Platform settings form calls `toast()` but never writes to DB                                                                                                                                                |
| **Course Builder — Drip tab is placeholder**        | Shows "coming soon" despite `courses` table having `drip_mode`, `drip_enabled`, `drip_interval_days`, `drip_schedule` columns                                                                                |
| **Course Builder — Reviews tab is placeholder**     | No `course_reviews` table exists                                                                                                                                                                             |
| **Course Builder — QnA Chatbot tab is placeholder** | Shows "coming soon"                                                                                                                                                                                          |
| **Course Builder — missing Schedule management**    | `course_schedules` table exists but no UI to manage it after refactor                                                                                                                                        |
| **Course Builder — missing Resources management**   | `course_resources` and `lesson_resources` tables exist but no UI                                                                                                                                             |
| **No file upload integration**                      | Thumbnail/banner/media URLs are entered manually as text; no actual upload to `course-content` storage bucket                                                                                                |
| **Referrals admin — profile join may fail**         | Uses `profiles!referral_codes_user_id_fkey` but this FK doesn't exist, falls back silently                                                                                                                   |


---

## CATEGORY 4: Missing Admin Controls That Should Exist


| Control Needed                          | Why                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| **Banner/Hero management**              | Admin should control what appears on home page carousel                                |
| **Featured Creators management**        | Admin should flag profiles as "featured"                                               |
| **Events/Upcoming management**          | Admin should create events visible on home page                                        |
| **Opportunity Board CRUD**              | Need `opportunities` table + admin approval workflow                                   |
| **Community Space management in admin** | Admin should create/edit/delete spaces from admin panel (currently only via direct DB) |
| **Notification template editor**        | Table exists but no UI                                                                 |
| **Platform settings persistence**       | Store branding, gamification config, feature flags in DB                               |
| **Student certificate viewer**          | Admin should see who earned certificates                                               |
| **Enrollment management**               | Admin should manually enroll/unenroll students                                         |
| **Reports/Flagging system**             | Need a `content_reports` table for moderation to work                                  |
| **File upload in course builder**       | Connect to `course-content` storage bucket for thumbnails, videos, PDFs                |


---

## CATEGORY 5: Recommended Fix Priority

### Phase 1 — Critical (app is misleading without these)

1. **Wire Home page to real data** — Replace mock courses, community posts, and featured creators with Supabase queries
2. **Wire Admin Users to real `profiles` + `user_roles**` — Currently shows fake users
3. **Wire Admin Dashboard to real aggregates** — Count enrollments, users, courses from DB
4. **Connect Workshops pages to `courses` table** — Filter by `course_type='workshop'`
5. **Connect Cohort pages to `courses` table** — Replace `cohortData.ts`
6. **Fix duplicate route** in App.tsx

### Phase 2 — Important (admin cannot manage what students see)

7. **Build Banner/Hero admin CRUD** — New `banners` table + admin page
8. **Build Drip tab** — Wire to existing `drip_mode`/`drip_schedule` columns
9. **Build Schedule tab** in course builder — Wire to `course_schedules` table
10. **Build Resources tab** in course builder — Wire to `course_resources` + `lesson_resources`
11. **Add file upload** — Connect course builder to `course-content` storage bucket
12. **Wire Admin Settings** to a `platform_settings` table
13. **Wire Admin Moderation** — Create `content_reports` table

### Phase 3 — Complete Feature Parity

14. **Build Opportunities backend** — Create `opportunities` table + admin + student pages
15. **Build Notifications feed** — Read from `scheduled_notifications` for student
16. **Build Reviews system** — Create `course_reviews` table + admin tab
17. **Build Explore page** — Query published courses with filters
18. **Featured Creators flag** — Add `is_featured` to profiles
19. **Enrollment management** in admin
20. **Certificate viewer** in admin

---

## Implementation Approach

Each fix follows the same pattern:

1. Create any missing DB tables via migration
2. Add RLS policies
3. Replace mock data imports with Supabase queries (React Query hooks)
4. Add admin CRUD where needed
5. Remove unused mock data files once fully migrated

No structural refactoring needed — the component architecture is solid. The work is primarily **replacing mock data sources with real queries** and **building missing admin CRUD screens** for content that students already see.