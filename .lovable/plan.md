

## Community Module — Complete Rebuild Plan

This is a major rebuild of `/community` into an immersive, Discord-inspired experience with a unified sidebar, social feed, and post system. The current Community.tsx (tab-based page inside AppShell) will be replaced with a full-screen layout that hides the bottom tab bar.

### Architecture Overview

```text
/community (full-screen, no AppShell)
├── Left Sidebar (280px desktop / drawer mobile)
│   ├── User context (avatar, name, level, XP, streak)
│   ├── Main Nav (Feed, People, Inbox)
│   ├── My Batches (expandable → channels inline)
│   ├── My Spaces (city/skill communities)
│   └── Bottom (← Back to Level Up, Settings)
└── Main Content Area
    ├── Feed View (default) — post cards with FAB
    ├── People View — directory
    ├── Inbox View — placeholder
    └── Post Detail View (/community/post/:id)
```

### Files to Create/Modify

**1. New: `src/data/feedData.ts`** — Mock data for 20 feed posts
- Types: `FeedPost`, `PostType` (thought, project, question, poll, milestone, collab), `Comment`, `PollOption`
- 20 posts with realistic Indian creative content, 8 marked as batch-mate posts
- Comments on some posts, poll data, media URLs from existing assets

**2. New: `src/pages/community/CommunityShell.tsx`** — The immersive layout
- Full-screen component (no AppShell wrapper)
- Left sidebar with all sections described (user context, nav, batches, spaces)
- Mobile: hamburger triggers slide-in drawer with dark overlay
- Desktop: persistent 280px sidebar
- Content area renders based on active view (feed/people/inbox)
- Batch items expand inline to show channels grouped by category (reuses batchData)
- "← Back to Level Up" navigates to `/home`

**3. Rewrite: `src/pages/Community.tsx`** — Becomes thin wrapper
- Simply renders `CommunityShell` instead of the current AppShell-wrapped tabbed layout
- The old cohort/explore/directory tabs move into the sidebar structure

**4. New: `src/components/community/FeedView.tsx`** — Feed with post cards
- Top bar: hamburger (mobile), "Feed" title, "For You" / "Latest" toggle pills
- Scrollable post cards with all specified elements (author row, post type labels, body truncation, media, tags, action bar)
- FAB (gold "+") opens Create Post modal
- Post type icons/labels: Project (gold/camera), Question (blue/?), Collab (green/handshake), Milestone (gold/trophy), Poll (purple/bar-chart)
- Action bar: heart, comment, repost, bookmark with tap interactions

**5. New: `src/components/community/CreatePostModal.tsx`** — Post creation
- Post type selector row (6 types with icons)
- Dynamic form based on selected type (thought, project, question, poll, milestone, collab)
- All fields as specified (title, body, media upload placeholder, tags, poll options, collab fields)
- Dialog on desktop, full-screen on mobile

**6. Rewrite: `src/pages/CommunityPost.tsx`** — Post detail view
- Full post content (untruncated) with media, tags
- Project feedback form (3 textareas if feedback requested)
- Comments section with 1-level threading
- Poll results (bar chart if voted, radio buttons if not)
- Fixed comment input at bottom

**7. Modify: `src/App.tsx`** — Route updates
- `/community` renders the new Community (which uses CommunityShell, no AppShell)
- `/community/post/:id` renders CommunityPost within the community shell context

**8. Modify: `src/components/layout/AppShell.tsx`** — No changes needed
- The community page simply won't use AppShell; the existing bottom tab bar naturally disappears

### Key Design Decisions

- **Sidebar background**: `#1A1A2E` (deep navy), matching existing BatchSpace sidebar style
- **Active item**: gold `#E8B931` text + 3px gold left border (uses existing `--highlight` CSS var)
- **Unread indicators**: red pill badges for counts, blue dots for new content
- **Batch expansion**: Clicking a batch in sidebar expands channels inline (accordion-style), clicking another collapses the previous
- **Feed post cards**: White cards (`bg-card`) with subtle shadow on `#FAFAFA` background — adapting to existing dark theme by using card/accent tokens
- **Mobile sidebar**: Slide-in drawer from left with semi-transparent dark overlay, any item tap closes it
- **The 3 mock batches**: "Video Editing — Batch 4" (existing from batchData), plus 2 new entries added to batchData
- **6 mock spaces**: Filmmaking, Video Editing, Cinematography, Mumbai Creators, Bangalore Creators, Chennai Creators — derived from existing communityData

### Mock Data Summary (feedData.ts)

20 posts total:
- 5 projects (with images from existing assets, feedback requested on 3)
- 4 thoughts (short text posts)
- 3 questions (tagged with skills)
- 2 polls (with 3-4 options each)
- 2 milestones (with trophy celebration)
- 2 collab calls (roles needed, city, budget)
- 2 regular/plain posts
- 8 posts have `batchId` set to show batch-mate pill

