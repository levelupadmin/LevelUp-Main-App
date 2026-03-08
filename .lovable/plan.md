## Current State Assessment

### What's Real (Database-backed)

- **Courses, Modules, Lessons** — fully stored in Supabase with CRUD in AdminContent
- **Storage bucket** (`course-content`) — for file/thumbnail uploads
- **Student-facing pages** (`CourseDetail`, `LessonDetail`) — connected to real data

### What's Still Mock / localStorage

Everything else in the admin panel and auth system runs on hardcoded mock data or localStorage:

---

## What Needs to Be Done

### 1. Real Authentication (Replace localStorage Mock)

- **Database**: `profiles` table (id references auth.users, name, avatar, city, bio, etc.)
- **Database**: `user_roles` table with `app_role` enum (`student`, `mentor`, `super_admin`) + `has_role()` security definer function
- **Code**: Replace `AuthContext.tsx` localStorage logic with Lovable Cloud auth (signup, login, email verification)
- **Code**: Update `AdminGuard` to check roles from database instead of localStorage
- **RLS**: Tighten courses/modules/lessons policies from `true` to role-based

### 2. User Management (AdminUsers — currently mock)

- **Database**: Uses `profiles` + `user_roles` tables from above
- **Code**: Replace `mockAdminUsers` with Supabase queries on `profiles` joined with `user_roles`
- **Code**: Wire up role changes and suspend/ban actions to real updates

### 3. Workshops (AdminWorkshops — currently mock)

- **Database**: `workshops` table (title, instructor_id, date, city, seats, price, status, etc.)
- **Database**: `workshop_registrations` table (user_id, workshop_id, registered_at)
- **Code**: Replace `mockAdminWorkshops` with Supabase CRUD
- **Code**: Wire student-facing Workshops/WorkshopDetail pages to real data

### 4. Cohorts & Applications (AdminCohorts — currently mock)

- **Database**: `cohorts` table (title, description, start_date, end_date, status, mentor_id, etc.)
- **Database**: `cohort_applications` table (user_id, cohort_id, status, review_note, portfolio data, etc.)
- **Code**: Replace `mockApplications`/`cohorts` with Supabase CRUD

### 5. Moderation (AdminModeration — currently mock)

- **Database**: `flagged_content` table (reporter_id, content_type, content_id, reason, status, resolved_by, etc.)
- **Code**: Replace `mockFlaggedItems` with Supabase queries

### 6. Opportunities (AdminOpportunities — currently mock)

- **Database**: `opportunities` table (title, company, description, type, skills, posted_by, review_status, etc.)
- **Code**: Replace `mockAdminOpportunities` with Supabase CRUD
- **Code**: Wire student-facing Opportunities pages to real data

### 7. Enrollment & Progress Tracking

- **Database**: `enrollments` table (user_id, course_id, enrolled_at, completed_at)
- **Database**: `lesson_progress` table (user_id, lesson_id, status, progress_pct, completed_at)
- **Code**: Track student progress, show completion %, resume functionality

### 8. Analytics (AdminAnalytics — currently mock)

- **Database**: Aggregate queries on enrollments, users, revenue
- **Code**: Replace `revenueData`, `userGrowthData`, etc. with real queries

### 9. Platform Settings (AdminSettings — currently mock)

- **Database**: `platform_settings` table (key-value or JSON config)
- **Code**: Replace `defaultPlatformSettings` with real persistence

### 10. Community & Posts (currently mock)

- **Database**: `community_posts`, `comments`, `likes` tables
- **Code**: Wire Community, CommunityPost, Directory pages to real data

---

## Recommended Priority Order


| Priority | Item                                   | Why                                           |
| -------- | -------------------------------------- | --------------------------------------------- |
| 1        | Real Authentication + Profiles + Roles | Everything depends on knowing who the user is |
| 2        | Enrollment & Progress Tracking         | Core student experience                       |
| 3        | Workshops (DB + Admin + Student)       | High-value feature, self-contained            |
| 4        | Cohorts & Applications                 | Depends on auth                               |
| 5        | Opportunities                          | Depends on auth                               |
| 6        | User Management                        | Depends on auth + roles                       |
| 7        | Community & Posts                      | Large scope, can come later                   |
| 8        | Moderation                             | Depends on community content existing         |
| 9        | Analytics                              | Depends on real data in all tables            |
| 10       | Platform Settings                      | Low priority, config storage                  |


This is roughly **10 database tables + 1 enum + 1 function** to create, and **~15 pages** of code to migrate from mock data to real queries.