

# Admin Panel Restructure: Separate Sales Pages from Course Content

## The Problem

Right now, everything is crammed into a single `AdminCourses.tsx` (1800+ lines) with 11 tabs. The user wants two clearly separated admin sections:

1. **Sales Pages** — presale/payment pages with Razorpay links, pricing variants, course tagging, and the customer-facing sales configuration
2. **Course Content** — purely for uploading and managing the actual learning material (modules, lessons, recordings, resources)

This mirrors how platforms like Teachable, Kajabi, and Thinkific separate their "Sales/Marketing" from "Course Builder" sections.

## Architecture

```text
Admin Sidebar (AdminLayout)
├── Dashboard
├── Sales Pages  ← NEW (presale pages, pricing, payment links)
├── Courses      ← REFOCUSED (content only: modules, lessons, resources)
├── Coupons
├── Referrals
├── Waitlists
├── Engagement
├── ...
```

### Sales Pages (`/admin/sales`)
A new page where each "sales page" is an entity that:
- Has its own presale content (headline, description, trailer, hero image)
- Contains 1-4 pricing variants, each with a Razorpay link
- Has a toggle for "which variant shows in-app vs. ads-only"
- **Tags to one or more courses** — purchasing any variant grants access to all tagged courses
- Supports course-type-specific CTAs: cohort → application form, masterclass/workshop → direct payment

This needs a new DB table: `sales_pages` with fields like `title`, `slug`, `description`, `trailer_url`, `hero_image_url`, `course_type_hint` (for UI), `is_published`, and a join table `sales_page_courses` linking sales pages to courses.

### Courses Page (refocused)
Strips out presale/pricing tabs. Keeps:
- Details (title, description, instructor, category)
- Content (modules/lessons — upload recordings, structure by week)
- Schedule (for workshops/cohorts — Zoom links, dates)
- Resources (slides, templates, recordings — with unlock toggles)
- Comments, Q&A, Report, Assignments, Settings

## Database Changes

### New table: `sales_pages`
```sql
id uuid PK, title text, slug text unique, description text,
hero_image_url text, trailer_url text, presale_description text,
course_type_hint text (masterclass/workshop/cohort),
is_published boolean default false,
show_application_form boolean default false,
created_at, updated_at
```

### New join table: `sales_page_courses`
```sql
id uuid PK, sales_page_id uuid FK, course_id uuid FK,
created_at, unique(sales_page_id, course_id)
```

### Alter `course_pricing_variants`
- Add `sales_page_id uuid` column (nullable, FK to sales_pages)
- This moves pricing variants from being course-scoped to sales-page-scoped
- Keep existing `course_id` for backward compat but new variants reference `sales_page_id`

### RLS
- Admins manage all sales_pages and sales_page_courses
- Anyone can read published sales_pages (for the storefront)

## Frontend Changes

### 1. New page: `AdminSalesPages.tsx` (`/admin/sales`)
**List view**: Table of sales pages with title, tagged courses count, active variant price, status, actions
**Detail view** (when clicking a sales page):
- **Content tab**: Hero image upload, trailer URL, presale description (rich text), feature bullets
- **Pricing tab**: CRUD for pricing variants with:
  - Label, price, Razorpay link
  - "Show in app" toggle (radio — only one at a time)
  - "Active for ads" toggle (multiple can be on)
  - Valid date range
- **Courses tab**: Tag/untag courses to this sales page. Dropdown to add courses, list with remove button. All tagged courses get granted on purchase.
- **Settings tab**: Application form toggle (for cohorts), published toggle

### 2. Refactor `AdminCourses.tsx`
- Remove "Presale" and "Pricing" tabs (moved to Sales Pages)
- Remove pricing variant management code
- Keep all content-management tabs
- Add a read-only indicator showing which sales page(s) link to this course

### 3. Update `AdminLayout.tsx`
- Add "Sales Pages" nav item between Dashboard and Courses
- Icon: `ShoppingBag` or `CreditCard`

### 4. Update `App.tsx`
- Add route: `/admin/sales` → `AdminSalesPages`

### 5. Frontend student flow update
- `CourseDetail.tsx` fetches the active pricing variant from the linked sales page instead of from the course directly
- When no sales page exists, falls back to the course's `payment_page_url`

## Implementation Order

1. **DB migration**: Create `sales_pages`, `sales_page_courses` tables, alter `course_pricing_variants`
2. **Build `AdminSalesPages.tsx`**: Full CRUD with list + detail views, pricing variants management, course tagging
3. **Refactor `AdminCourses.tsx`**: Remove presale/pricing tabs, add "linked sales pages" indicator
4. **Update AdminLayout + App.tsx**: Add nav item and route
5. **Update student-facing CourseDetail**: Fetch pricing from sales page

