

## Community Module — Hybrid Visual Redesign

The problem: Right now, the community sidebar treats cities and skills as Discord-style text items with channel lists. This is visually flat and unengaging for discovery. The user wants the **top-level browsing** (Feed, People, Inbox, discovering cities/skills) to be **visually rich** — with image cards like the reference screenshot — and only drill into Discord-style channels when you open a specific space.

### New Architecture: Two-Layer UX

```text
Layer 1: VISUAL BROWSING (Feed view is default)
├── Feed tab — Twitter-like social feed (already built, keep as-is)
├── Spaces tab — NEW: visual discovery page
│   ├── "CITIES" section — horizontal scroll of city cards with landmark photos
│   ├── "SKILLS" section — horizontal scroll of skill cards with themed images
│   └── Clicking a card → drills into Layer 2
├── People tab — creator directory (already built, keep as-is)
└── Inbox tab — DMs placeholder (already built, keep as-is)

Layer 2: DISCORD-STYLE SPACE (replaces main content)
├── Back button to return to Layer 1
├── Space header (name, image, member count)
├── Channel sidebar or tabs
└── Channel message view (SpaceChannelView)
```

### What Changes

**1. `src/pages/community/CommunityShell.tsx`** — Simplify sidebar
- **Remove** the entire "My Spaces" section (cities/skills channel trees) from the sidebar
- **Keep** sidebar with: User context, Main Nav (Feed, **Spaces** (replacing nothing — new tab), People, Inbox), My Batches (expandable channels), Back to Level Up
- Add "Spaces" as a new nav item (icon: Compass/Globe) between Feed and People
- When "Spaces" is active, render new `SpacesView` in main area
- When a space is drilled into, render a `SpaceDetail` view with channel navigation
- Add new view type: `"spaces"` and `"space-detail"` to the view state

**2. New: `src/components/community/SpacesView.tsx`** — Visual discovery page
- Top bar: hamburger (mobile) + "Spaces" title
- **CITIES section**: "CITIES" header (uppercase, bold) + horizontal scrollable row of city cards
  - Each card: ~160px wide, ~200px tall, city landmark photo as background (from existing assets), city name overlay at bottom, member count badge, gradient overlay
  - Clicking → sets active space in shell state, switches to space detail view
- **SKILLS section**: Same pattern with skill community images
- Both sections use the existing `cityCommunities` and `skillCommunities` data with their images
- Style inspired by the reference screenshot: dark cards with image backgrounds, white text overlay, rounded corners

**3. New: `src/components/community/SpaceDetailView.tsx`** — Drilled-in space view
- Header: back arrow + space name + member count + space image (small)
- Channel tabs (horizontal scrollable pills) or a mini sidebar showing the space's channels
- Selected channel renders `SpaceChannelView` (already built) below
- This is where it becomes "Discord-like" — channel messages, compose bar, etc.

**4. Minor updates to `src/data/feedData.ts`**
- Remove `sidebarSpaces` export (no longer needed in sidebar)

### Files Summary

| File | Action |
|------|--------|
| `src/pages/community/CommunityShell.tsx` | Simplify: remove space trees from sidebar, add "Spaces" nav item, handle space-detail view state |
| `src/components/community/SpacesView.tsx` | New: visual city + skill cards grid/scroll |
| `src/components/community/SpaceDetailView.tsx` | New: drilled-in space with channel tabs + message view |
| `src/data/feedData.ts` | Minor: clean up unused sidebar space data |

### Design Details
- City cards use existing imported images (`city-chennai.jpg`, `city-bangalore.jpg`, etc.)
- Skill cards use existing images (`hero-filmmaking-1.jpg`, `hero-editing-1.jpg`, etc.)
- Cards have a dark gradient overlay (`linear-gradient(transparent 40%, rgba(0,0,0,0.8))`) with white text
- Active/selected city card gets a gold border (like the Chennai card in the reference with a highlight border)
- The "Spaces" nav item in sidebar uses a Compass icon
- Batch channels remain in the sidebar (unchanged) — those are private cohort spaces, different from public community spaces

