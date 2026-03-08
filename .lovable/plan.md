

## Community Module — Unified Restructure Plan

The user wants two clear divisions in the community:

1. **Cohort Batch Spaces** — Private Discord-like spaces per enrolled batch (already built, needs integration into the unified shell)
2. **General Community** — Open to everyone, with city-based spaces, skill-based spaces, a Twitter-like social feed, creator discovery/directory, and DMs

The current implementation has these pieces built but they're disconnected: `CommunityShell` has Feed/People/Inbox + sidebar batches with inline channel expansion, `BatchSpace` is a separate standalone page, `SpaceCommunity` uses AppShell instead of the community shell. The goal is to unify everything under one immersive shell.

### Architecture

```text
/community (CommunityShell — immersive, no AppShell)
├── Sidebar (always present)
│   ├── User context
│   ├── Main Nav: Feed / People / Inbox
│   ├── My Batches (expand inline → channels → ChannelView in main area)
│   ├── My Spaces: city + skill spaces (expand inline → channels)
│   └── Back to Level Up
└── Main Content (swaps based on selection)
    ├── Feed (default) — Twitter-like social feed
    ├── People — creator directory with filters
    ├── Inbox — DMs placeholder
    ├── ChannelView — batch channel messages
    └── SpaceChannelView — city/skill space channel messages
```

### What Changes

**1. `src/pages/community/CommunityShell.tsx`** — Major update
- Add "My Spaces" section with the same expand-inline behavior as batches: clicking a space expands its channels in the sidebar, selecting a channel renders messages in the main area
- Split spaces into two sub-sections: "Cities" and "Skills" with emoji prefixes
- Use `communityData.ts` city/skill communities + their channels for the space expansion
- When a space channel is selected, render a lightweight channel view (reuse or adapt `ChannelView` pattern) showing `mockChannelMessages` in the main content area
- Add "+ Discover Spaces" link that could navigate to a space browser view (placeholder for now)
- Ensure accordion behavior: expanding a batch collapses any expanded space, and vice versa

**2. Remove standalone routes for spaces**
- `/community/city/:slug` and `/community/skill/:slug` will no longer navigate away — they'll be handled inline in the shell
- Remove or deprecate `SpaceCommunity.tsx` as a routed page (keep the file but it won't be routed)
- Update `src/App.tsx` to remove those routes (or redirect them to `/community`)

**3. `src/pages/community/BatchSpace.tsx`** — Keep as standalone for `/community/batch/:id` deep-link
- This remains for direct URL access, but the primary entry point is now through sidebar expansion in `CommunityShell`

**4. Space Channel View component**
- Create `src/components/community/SpaceChannelView.tsx` — a simpler version of `ChannelView` for city/skill spaces
- Shows channel header (emoji + name + community name), message feed from `mockChannelMessages`, and compose bar
- Reuses the same message card styling from the existing `SpaceCommunity` but adapted to the immersive shell layout

**5. `src/pages/Index.tsx`** — Add "My Batch" summary card
- Add a card in the home page: "Video Editing — Batch 4 has 18 new messages" with a "Go to batch →" button navigating to `/community`
- Place it after "Continue Learning" section

**6. Sidebar space data**
- Update `src/data/feedData.ts` sidebar spaces to include both city and skill spaces with proper slugs matching `communityData.ts`
- Or directly import from `communityData.ts` in the shell

### Files Summary

| File | Action |
|------|--------|
| `src/pages/community/CommunityShell.tsx` | Major update — add space expansion with channels |
| `src/components/community/SpaceChannelView.tsx` | New — lightweight channel view for spaces |
| `src/data/feedData.ts` | Update sidebar spaces to match communityData |
| `src/pages/Index.tsx` | Add "My Batch" summary card |
| `src/App.tsx` | Remove/simplify space routes, redirect to /community |
| `src/pages/community/SpaceCommunity.tsx` | Keep but no longer routed directly |

### Design Decisions
- Spaces use emoji-based channel icons (from `communityData.ts`) instead of `#` prefix
- Space channels show the simpler message card style (not full Discord-style threading) — appropriate for open community spaces vs. private batch spaces
- City spaces grouped under "🏙️ Cities" sub-header, skill spaces under "✨ Skills" sub-header in sidebar
- Active space channel gets same gold highlight as batch channels

