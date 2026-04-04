

# Fix White Screen in Preview — Lazy Loading + Error Boundary

## Root Cause
The Lovable preview iframe proxy intermittently returns 503 for module requests during Vite's on-demand loading. Since all ~15 admin pages are eagerly imported in `App.tsx`, a single 503 on any admin module (e.g. `AdminCommentsTab.tsx`) crashes the entire React tree before it mounts. In a separate browser tab, the connection is more stable, so modules load successfully.

## Fix

### 1. Lazy-load all admin pages in `App.tsx`
Replace the 13 static admin imports with `React.lazy()` + `Suspense`. This means admin modules are only fetched when the user navigates to `/admin/*`, so a 503 on an admin module won't crash the homepage.

```text
Before: import AdminDashboard from "./pages/admin/AdminDashboard";
After:  const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
```

Wrap admin routes in a `<Suspense fallback={<LoadingSpinner />}>`.

### 2. Add a global ErrorBoundary in `App.tsx`
Wrap the entire `<Routes>` in an ErrorBoundary component that catches render errors and shows a "Something went wrong — Retry" screen instead of a white screen. This catches any remaining transient failures.

### 3. Create `src/components/ErrorBoundary.tsx`
A simple class component with `componentDidCatch` that renders a retry button calling `window.location.reload()`.

## Files to modify
- **`src/App.tsx`** — lazy imports for admin pages, add Suspense + ErrorBoundary wrapper
- **`src/components/ErrorBoundary.tsx`** — new file, global error boundary component

## Technical notes
- Only admin pages need lazy loading since they're the heaviest import chain and not needed on initial load
- The ErrorBoundary prevents any uncaught render error from producing a white screen
- No changes to routing logic or auth guards needed

