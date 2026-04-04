

# Hero CRUD Admin Interface

## Overview
Create a `hero_slides` database table and an admin page to manage the hero carousel slides (background images, headlines, subtitle, CTA). Update `HeroCarousel.tsx` to fetch slides from the database instead of using hardcoded values.

## Database

New table: `hero_slides`
- `id` uuid PK
- `title` text (headline text, e.g. "Where India's next great")
- `rotating_words` text[] (e.g. `{"filmmakers","editors","storytellers"}`)
- `subtitle` text
- `cta_label` text (default "See all Programs")
- `cta_link` text (default "/explore")
- `image_url` text (background image URL)
- `sort_order` integer (default 0)
- `is_active` boolean (default true)
- `created_at` timestamptz

RLS: admins/mentors get full access, public SELECT on `is_active = true`.

## Files to Create/Modify

### 1. `src/pages/admin/AdminHeroSlides.tsx` (new)
Admin page within `AdminLayout` providing:
- List of slides as draggable cards showing thumbnail, title, active toggle
- Create/edit dialog with fields: title, rotating words (comma-separated input), subtitle, CTA label, CTA link, image upload (to `course-content` bucket), sort order, active toggle
- Delete confirmation
- Uses React Query + Supabase for CRUD

### 2. `src/App.tsx`
- Add lazy import for `AdminHeroSlides`
- Add route: `/admin/hero` under admin guard

### 3. `src/components/layout/AdminLayout.tsx`
- Add nav item `{ path: "/admin/hero", label: "Hero Slides", icon: Clapperboard, roles: ["super_admin"] }` after Dashboard

### 4. `src/components/home/HeroCarousel.tsx`
- Fetch active slides from `hero_slides` table ordered by `sort_order`
- Fall back to existing hardcoded data if query returns empty (graceful degradation)
- Use `image_url` for backgrounds, first slide's `rotating_words` for the word rotation
- Keep existing animations and layout unchanged

## Technical Notes
- Image upload reuses the existing `course-content` storage bucket
- Rotating words stored as a Postgres text array, entered as comma-separated in the admin UI
- The carousel continues to work with hardcoded fallback if no slides exist yet, ensuring zero downtime

