

# Community Module Redesign — Full Plan

## Understanding Your Vision

You want Community to be the **core engagement hub** — not just a feature tab, but a destination that feels like its own product within LevelUp. Two major divisions:

1. **Cohort Spaces** — Private, Discord-like batch communities for enrolled students
2. **Open Community** — A public creative network with feed, discovery, and creator connections

When a user clicks "Community" in the main nav, the **entire left sidebar transforms** into community-specific navigation, replacing the default app nav.

---

## Information Architecture

```text
Community (left sidebar replaces app nav)
├── 🏠 Feed          ← Twitter-like timeline (default landing)
├── 📚 My Spaces     ← Enrolled cohort batch spaces
├── 🔍 Discover      ← City + Skill community browsing
└── 👥 Meet Creators ← Creator directory with filters

Feed
├── Posts from followed creators + batchmates
├── Trending/popular threads (for new users with few follows)
├── Post composer (text + optional image)
├── Like, comment, share interactions
└── "Share to community" from lesson activities

My Spaces (cohort)
├── Banner cards for each enrolled batch
└── Click → Discord-like channel view (existing)

Discover
├── City communities (image cards)
└── Skill communities (image cards)

Meet Creators
├── Search + filters (city, skill, role, experience)
└── Creator profile cards with "Connect" action
```

---

## Implementation Plan

### 1. Community Shell Layout (`src/pages/Community.tsx`)

Replace the current tab-based layout with a **dedicated community shell** that has its own sidebar navigation:

- **Desktop**: A slim left sidebar (w-56) with 4 nav items (Feed, My Spaces, Discover, Meet Creators) + a "Back to app" link at top. Main content area renders the selected section.
- **Mobile**: Bottom pill tabs or top horizontal tabs for the 4 sections, with a back arrow to return to the main app.
- The AppShell's main sidebar is still rendered but the community content area manages its own sub-navigation visually (the community page takes full width within AppShell's main area and renders its own inner sidebar).

### 2. Feed System (`src/components/community/FeedView.tsx`)

New Twitter-like feed as the **default landing** when entering Community:

- **Post composer** at top: avatar + "What's on your mind?" input → expands to textarea + "Post" button
- **Feed items**: Each post shows author avatar/name/role, timestamp, text content, optional image, like count, comment count, "Comment" expand
- **Feed logic (mock)**: 
  - If user follows people → show posts from followed creators + all batchmates (auto-followed)
  - If no follows → show trending posts sorted by engagement (likes + comments)
  - Mix in a "Popular this week" section for high-engagement threads
- **Data**: New `feedPosts` array in `src/data/communityData.ts` with ~8-10 mock posts from various creators, some with images, varying engagement levels

### 3. My Spaces View (`src/components/community/MySpacesView.tsx`)

Extract the existing `MyCohorts` banner card UI into its own component. No major changes — the banner cards already work well. Clicking navigates to the existing Discord-like `CohortCommunity` page.

### 4. Discover & Meet Creators Views

Extract existing `ExploreCommunities` and `DirectoryPreview` into their own component files. The directory view will be the full inline directory (not just a preview with 4 cards) — embed the full filter/search/grid directly in the community shell rather than navigating to a separate `/community/directory` route.

### 5. Data Updates (`src/data/communityData.ts`)

Add:
- `FeedPost` interface: `{ id, author, avatar, role, content, image?, timeAgo, likes, comments, commentsData[], isFollowing, isBatchmate }`
- `feedPosts` mock array (~10 posts with realistic creator content — sharing work, asking questions, celebrating wins)
- `trendingPosts` computed subset (highest engagement)

### 6. Route Simplification

The community sub-sections (Feed, Discover, Meet Creators) will be **state-driven** within the single `/community` route (no new routes needed). The existing routes for `/community/cohort/:slug`, `/community/city/:slug`, `/community/skill/:slug` remain unchanged.

---

## Files to Create/Edit

| File | Action |
|------|--------|
| `src/pages/Community.tsx` | **Rewrite** — new shell with inner sidebar + 4 section views |
| `src/data/communityData.ts` | **Edit** — add FeedPost interface + mock feed data |

All sections (Feed, MySpaces, Discover, MeetCreators) will live as inline components within `Community.tsx` to keep it self-contained, similar to the current pattern but with the new sidebar layout and the feed as the primary addition.

