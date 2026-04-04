

# Fix: Admin Dashboard shows "Mentor Dashboard" instead of full Super Admin view

## Problem

The screenshot confirms: even with "Super Admin" selected in Dev Mode, the admin dashboard shows "Mentor Dashboard" with only "Pending Submissions" and limited quick actions. The header badge shows "Student".

## Root Cause

`AdminLayout` and `AdminDashboard` read the role via `useAuth()`, which proxies to `useDevAuth()`. While this chain *should* work, the `updateProfile` function exposed by `useAuth` is a **no-op** — so AdminLayout's built-in role switcher (visible in the sidebar footer and header) does nothing when clicked, potentially confusing state. More critically, there may be a React re-render timing issue where navigation happens before the DevAuthContext state update propagates, and the components mount with stale role data.

## Fix

Make `AdminLayout` and `AdminDashboard` **directly import and use `useDevAuth()`** for the role, instead of relying on the indirect `useAuth()` proxy. This guarantees they always read the latest role from DevAuthContext.

### 1. `src/components/layout/AdminLayout.tsx`
- Import `useDevAuth` from DevAuthContext
- Replace `useAuth()` usage with `useDevAuth()` for role determination
- Wire the sidebar role switcher to call `devCtx.setRole()` instead of the no-op `updateProfile`
- Keep the nav filtering using `devUser.role`

### 2. `src/pages/admin/AdminDashboard.tsx`
- Import `useDevAuth` from DevAuthContext
- Derive `isSuperAdmin` from `devCtx.user.role === "super_admin"` instead of `useAuth().user?.role`
- This ensures the full KPI grid (Users, Courses, Enrollments, Completion Rate) and all 4 quick actions render for super admin

### 3. `src/components/guards/AdminGuard.tsx` (already correct)
- Already uses `useDevAuth` directly — no changes needed

## Result
Selecting "Super Admin" in Dev Mode will immediately show the full admin dashboard with all stats, all sidebar nav items, and all quick actions.

