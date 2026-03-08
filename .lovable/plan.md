

# Complete Admin Panel with Role-Based Access

## Roles & Access Matrix

```text
Page                  | Super Admin | Mentor              | Student
─────────────────────-┼─────────────┼─────────────────────┼────────
Dashboard             | Full stats  | Limited (own data)  | No access
Content Management    | Full CRUD   | View/edit assigned  | No access
Workshop Management   | Full CRUD   | Own workshops only  | No access
Cohort Applications   | All cohorts | Own cohort apps     | No access
Moderation            | Full        | ✗                   | No access
User Management       | Full        | ✗                   | No access
Analytics             | Full        | Own cohort stats    | No access
Opportunity Review    | Full        | ✗                   | No access
Platform Settings     | Full        | ✗                   | No access
```

## Implementation

### 1. Role System in AuthContext
Add `role: "student" | "mentor" | "super_admin"` to `UserProfile`. Add a mock role switcher in the admin sidebar header so you can test all three views. Default mock user gets `super_admin`. `useIsAdmin` in `AdminGuard` checks for `mentor` or `super_admin`.

### 2. AdminLayout Update
- Add role indicator badge next to "Admin" label
- Role-aware sidebar: hide nav items the current role can't access (e.g., Mentors don't see Moderation, Users, Settings)
- Add a dev-mode role switcher dropdown at bottom of sidebar for testing
- Add two new nav items: "Opportunities" and "Settings"

### 3. AdminGuard Update
Use `useAuth()` to check `user.role` instead of hardcoded `true`. Allow `super_admin` and `mentor` roles. Each page internally checks granular permissions.

### 4. Dashboard Page (rewrite)
- **Super Admin view**: Full stats grid (Users, Revenue, Courses, Active Reports, Enrollments, Completions), recent activity feed (new signups, submissions, reports), quick action buttons (Create Course, Review Applications, View Reports)
- **Mentor view**: Only shows their cohort stats (enrolled students, pending submissions, upcoming sessions), their recent student activity

### 5. Content Management Page (rewrite)
- Searchable/filterable table of all courses with columns: Title, Instructor, Category, Status (Draft/Published/Archived), Students, Rating, Actions
- Row actions: Edit, Publish/Unpublish, Archive, Delete (super_admin only)
- "Create Course" button (super_admin only)
- Mentors see only courses assigned to them
- Click row → inline edit panel or detail view

### 6. Workshop Management Page (rewrite)
- Table: Title, Instructor, Date, City, Price, Seats (booked/total), Status (Upcoming/Live/Completed/Cancelled)
- Actions: Edit details, Cancel, View registrations
- "Schedule Workshop" button
- Mentors see only their workshops

### 7. Moderation Page (rewrite, super_admin only)
- Tabs: Flagged Posts | Reported Users | Pending Reviews
- Each flagged item shows: content preview, reporter, reason, timestamp
- Actions: Dismiss, Warn User, Remove Content, Ban User
- Stats bar: Open reports, resolved today, avg resolution time

### 8. User Management Page (rewrite, super_admin only)
- Searchable table: Name, Email, City, Role, Level, Status (Active/Suspended/Banned), Joined date
- Filters: role, status, city
- Row actions: View Profile, Change Role (student↔mentor↔super_admin), Suspend, Ban
- Role change shows confirmation dialog
- User detail slide-out: activity summary, enrolled courses, reports

### 9. Analytics Page (rewrite)
- **Revenue chart** (line chart, last 6 months) using recharts
- **User growth chart** (area chart)
- **Course completion rates** (bar chart)
- **Top courses by enrollment** (horizontal bar)
- **City-wise distribution** (pie chart)
- Date range selector (7d / 30d / 90d / all)
- Mentors see only their cohort analytics

### 10. Opportunity Review Page (new, super_admin only)
- Route: `/admin/opportunities`
- Table of submitted opportunities: Title, Type, Poster, Status (Pending/Approved/Rejected), Submitted date
- Click → detail view with full opportunity preview
- Actions: Approve, Reject (with reason textarea), Request Changes

### 11. Platform Settings Page (new, super_admin only)
- Route: `/admin/settings`
- Sections: General (platform name, description), Gamification (XP multipliers, level thresholds), Subscription (plan names, prices), Feature Flags (toggles for community feed, opportunities, etc.)
- All mock/local state — just UI for now

### Files to Create/Edit

| File | Action |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add `role` field to UserProfile |
| `src/components/guards/AdminGuard.tsx` | Use AuthContext role check |
| `src/components/layout/AdminLayout.tsx` | Role-aware nav + role switcher |
| `src/pages/admin/AdminDashboard.tsx` | Full stats + activity feed |
| `src/pages/admin/AdminContent.tsx` | Course management table |
| `src/pages/admin/AdminWorkshops.tsx` | Workshop management table |
| `src/pages/admin/AdminModeration.tsx` | Flagged content review |
| `src/pages/admin/AdminUsers.tsx` | User table + role management |
| `src/pages/admin/AdminAnalytics.tsx` | Charts with recharts |
| `src/pages/admin/AdminOpportunities.tsx` | **Create** — opportunity review |
| `src/pages/admin/AdminSettings.tsx` | **Create** — platform settings |
| `src/data/adminData.ts` | **Create** — mock data for all admin tables |
| `src/App.tsx` | Add new admin routes |

