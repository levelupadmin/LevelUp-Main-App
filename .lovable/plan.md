
Problem identified: the persistent white screen is very likely being caused by an invalid dev-role state introduced by the recent admin changes.

What’s actually wrong
- `DevAuthContext` only supports these roles: `super_admin`, `mentor`, `student_enrolled`, `student_free`
- But `AdminLayout` now calls `setRole("student")`
- `DevRoleSwitcher` assumes `currentRole` is always valid and does:
  `const current = ROLE_OPTIONS.find((r) => r.value === currentRole)!;`
- If `currentRole` becomes `"student"`, `current` is `undefined`, and reading `current.label` will crash the app, which matches the white-screen symptom

Implementation plan
1. Fix `src/components/layout/AdminLayout.tsx`
- Stop passing `"student"` into `setRole`
- Replace the admin role switcher options with valid dev roles only:
  - `super_admin`
  - `mentor`
  - `student_enrolled`
  - `student_free`
- Map labels explicitly so the admin layout can still show friendly names

2. Harden `src/components/dev/DevRoleSwitcher.tsx`
- Remove the unsafe non-null assumption
- Add a safe fallback if `currentRole` is ever invalid, so the preview does not white-screen again even if bad state slips in

3. Review admin role checks for consistency
- Keep admin access based on `super_admin` and `mentor`
- Make sure student-facing fallback behavior uses one of the real dev student roles, not `"student"`

Files to update
- `src/components/layout/AdminLayout.tsx`
- `src/components/dev/DevRoleSwitcher.tsx`

Expected outcome
- Preview should render again instead of showing a blank white screen
- Super Admin / Mentor switching should keep working
- Student switching from the admin layout will no longer poison dev state
- Opening the preview in another tab should no longer be required as a workaround

Technical note
- This is separate from the earlier enrollment fix
- The likely crash path is:
```text
AdminLayout dropdown -> setRole("student")
-> DevAuthContext currentRole becomes invalid
-> DevRoleSwitcher tries current.label on undefined
-> React render crashes
-> white screen
```
