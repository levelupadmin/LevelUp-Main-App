

# Authentication, Onboarding & Profile Modules

## Scope

Three modules to build: (1) Login with mock OTP/Google/Email flow, (2) 3-step onboarding quiz, (3) rich profile view + edit + public profile. All using React Context for auth state (no real backend yet).

---

## 1. Auth Context (`src/contexts/AuthContext.tsx`)

Create a React Context to manage mock auth state across the app:
- State: `{ isAuthenticated, isLoading, user, hasCompletedOnboarding }`
- `user` object: `{ phone, name, avatar, bio, city, roles, interests, experience, goal }`
- Methods: `login()`, `logout()`, `completeOnboarding(data)`, `updateProfile(data)`
- Persists to `localStorage` so state survives refresh
- Wrap the app in `<AuthProvider>` in `App.tsx`

## 2. Login Screen (`src/pages/Auth.tsx`) — Rewrite

Route: `/login` (rename from `/auth`)

- Logo + "Welcome to Level Up" heading
- **Three sign-in methods** (tabs or stacked):
  - **Phone**: `+91` prefix + 10-digit input → "Send OTP" gold button → reveals 4-digit OTP input → "Verify" button. Any 4-digit code succeeds.
  - **Email**: Email input → "Send OTP" → same 4-digit mock flow
  - **Google**: Outline button, mock instant login
- Divider: "or continue with"
- Bottom link: "Just want to look around? Browse catalog" → `/explore`
- On success: check `hasCompletedOnboarding` → redirect to `/onboarding` or `/home`

## 3. Onboarding Quiz (`src/pages/Onboarding.tsx`) — Rewrite

3-step progressive quiz with step dots/progress indicator:

- **Step 1 — "What excites you?"**: Grid of 6 selectable cards (multi-select): Filmmaking, Video Editing, Cinematography, Content Creation, Design, Music. Each card has emoji/icon + label. Selected state: gold border + checkmark.
- **Step 2 — "Where are you in your journey?"**: 3 radio-style cards (single select): Beginner / Intermediate / Advanced with descriptions.
- **Step 3 — "What's your main goal?"**: 4 radio-style cards: Learn a new skill / Build my portfolio / Find collaborators or work / Explore and discover.
- "Next" advances, "Back" goes back. Final step: "Get Started" → saves to context → `/home`.
- Skippable via "Skip for now" link. Progress indicator shows completion encouragement.

## 4. AuthGuard Update (`src/components/guards/AuthGuard.tsx`)

- Import `useAuth` from `AuthContext` instead of the local placeholder
- Redirect unauthenticated users to `/login`

## 5. Profile View (`src/pages/Profile.tsx`) — Rewrite

Scrollable profile page:
- Cover image area (default gradient if none)
- Avatar (circular, 80px) overlapping cover, bottom-center
- Name, role tags (up to 3, as gold pills), city with map-pin icon
- Level badge: "Level 3 — Creator" with XP progress bar to next level
- Streak count with fire icon
- Availability status: green dot + "Open to work" / amber + "Open to collaborate" / grey + "Not looking"
- Bio text (280 chars max)
- **Skills section**: pill tags (e.g., "Premiere Pro", "DaVinci Resolve", "Color Grading")
- **Portfolio section**: 2-column grid of project cards (thumbnail, title, appreciation count). "See all" link.
- **Badges section**: horizontal scroll of earned badge icons with names. Empty state: "Complete courses to earn badges."
- **Stats row**: Courses completed | Projects shared | Peer feedback given
- If viewing own profile: "Edit Profile" button. If viewing others: "Follow" + "Connect" + "Message" buttons.
- Profile completion progress bar at top if <80% complete with nudge text.

## 6. Edit Profile (`src/pages/ProfileEdit.tsx`) — New

Form for editing profile:
- Fields: Name, Avatar upload, Cover upload, Bio (280 char counter), City (dropdown of major Indian cities), Role tags (multi-select from taxonomy: Director, Cinematographer, Editor, Content Creator, Sound Designer, Writer, Producer, Colorist, VFX Artist, Music Composer)
- Skills (multi-select tag input)
- Availability toggle (3 options)
- Social links: Instagram, YouTube, LinkedIn (optional)
- "Save" and "Cancel" buttons
- Updates context + shows success toast

## 7. Public Profile (`src/pages/ProfilePublic.tsx`) — Rewrite

Same layout as own profile but:
- No "Edit Profile" button
- Shows "Follow", "Connect", "Message" buttons instead
- Portfolio, badges, stats all visible

## 8. Route Updates (`src/App.tsx`)

- Rename `/auth` to `/login`
- Add `/profile/edit` route
- Wrap app in `<AuthProvider>`

---

## Files to Create/Edit

| File | Action |
|------|--------|
| `src/contexts/AuthContext.tsx` | **Create** — auth context with mock state + localStorage |
| `src/pages/Auth.tsx` | **Rewrite** — full login screen with phone/email OTP + Google |
| `src/pages/Onboarding.tsx` | **Rewrite** — 3-step progressive quiz |
| `src/pages/Profile.tsx` | **Rewrite** — rich scrollable profile with all sections |
| `src/pages/ProfileEdit.tsx` | **Create** — edit profile form |
| `src/pages/ProfilePublic.tsx` | **Rewrite** — public profile view with follow/connect |
| `src/components/guards/AuthGuard.tsx` | **Edit** — use AuthContext |
| `src/App.tsx` | **Edit** — add AuthProvider, rename route, add /profile/edit |
| `src/data/mockData.ts` | **Edit** — extend userProfile with new fields (city, roles, skills, availability, portfolio, social links) |

