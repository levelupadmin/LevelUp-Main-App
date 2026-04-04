

# Fix: Admin Portal Not Reflecting Dev Role Properly

## Root Cause

`AdminLayout` reads the user role via `useAuth()`. The `useAuth` hook tries to pull the dev user via `require("@/contexts/DevAuthContext")` inside a try/catch — but `require()` is a CommonJS pattern that doesn't work reliably in Vite's ESM bundler. When it fails silently, `useAuth` returns `user: null`, so `currentRole` defaults to `"student"`. Since no admin nav items include the `"student"` role, the sidebar appears empty/broken and the dashboard renders the non-super-admin view.

## Fix

1. **`AdminLayout.tsx`** — Import `useDevAuth` directly instead of relying on the broken `useAuth` proxy. Use `devUser.role` for nav filtering and role display.

2. **`AuthContext.tsx`** — Replace the fragile `require()` call in `useAuth` with a proper React import of `useDevAuth`, so all consumers of `useAuth` also get the correct dev role going forward.

3. **`AdminDashboard.tsx`** — Ensure `isSuperAdmin` derives from the same reliable source so the full KPI grid and quick actions render.

## Files

- **Modify** `src/contexts/AuthContext.tsx` — replace `require()` with a direct import of `useDevAuth`
- **Modify** `src/components/layout/AdminLayout.tsx` — import `useDevAuth` directly as a fallback for role
- **Modify** `src/pages/admin/AdminDashboard.tsx` — ensure role check uses the same reliable source

