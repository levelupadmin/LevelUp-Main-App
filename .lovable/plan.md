

## Discord-Style Community Chat — Plan

### Current State
The community section has spaces (city/skill) that show a flat list of posts with titles — more like a forum than a chat. Each space renders via `SpaceCommunity.tsx` with a single feed of posts. There are no channels within a space, no real-time chat feel, and no thread concept.

### Target: Discord-Inspired Structure, Current Design Aesthetic

Based on the Refero research, Discord's key structural patterns are:
1. **Server = Space** (left sidebar shows the space with its channels)
2. **Channels** within each server (text channels grouped by category)
3. **Chat-style messages** in each channel (avatar + name + timestamp + message, not card-based posts)
4. **Threads** spawned from messages for focused discussion
5. **Message input** pinned at bottom, not a post composer

### Architecture

```text
┌─────────────────────────────────────────────────┐
│ AppShell (existing)                             │
│ ┌──────────┬────────────────────────────────────┤
│ │ Channel  │  Channel Header (#general)         │
│ │ Sidebar  │────────────────────────────────────│
│ │          │  Chat Messages (scrollable)        │
│ │ #general │  ┌─ Avatar  Name   12:30pm ──────┐ │
│ │ #intros  │  │ Message text here              │ │
│ │ #showcase│  │ [Reply] [Like]                 │ │
│ │ #help    │  └───────────────────────────────┘ │
│ │          │  ┌─ Avatar  Name   12:35pm ──────┐ │
│ │          │  │ Another message                │ │
│ │          │  └───────────────────────────────┘ │
│ │          │────────────────────────────────────│
│ │          │  Message Input (pinned bottom)     │
│ └──────────┴────────────────────────────────────┘
```

On mobile: channel sidebar collapses into a top dropdown/sheet.

### Database Changes

1. **New `community_channels` table** — channels within each space:
   - `id`, `space_id` (FK to community_spaces), `name`, `slug`, `description`, `icon`, `sort_order`, `is_default`, `created_at`

2. **New `channel_messages` table** — chat messages (replaces posts for the chat experience):
   - `id`, `channel_id` (FK), `user_id`, `content` (text), `image_url`, `parent_id` (nullable, for threads), `created_at`, `updated_at`

3. **New `message_reactions` table** — emoji reactions on messages:
   - `id`, `message_id` (FK), `user_id`, `emoji` (text), `created_at`
   - Unique constraint on (message_id, user_id, emoji)

4. **Seed default channels** for each existing space (e.g., `#general`, `#introductions`, `#showcase`)

5. **Enable realtime** on `channel_messages` for live chat updates

6. **RLS policies**: Authenticated users can read all channels/messages, insert own messages, delete own messages. Admins can manage all.

### Frontend Changes

1. **New `src/hooks/useCommunityChat.ts`** — hooks for channels, messages, reactions, and realtime subscriptions

2. **Refactor `SpaceCommunity.tsx`** — replace the flat post list with a Discord-style layout:
   - Left: channel sidebar (list of channels with icons, active highlight)
   - Right: chat area with scrolling messages + pinned bottom input
   - Thread panel: slides in from right when clicking "Reply" on a message

3. **New `src/components/community/ChannelSidebar.tsx`** — vertical channel list with active state, collapsible on mobile

4. **New `src/components/community/ChatMessageList.tsx`** — virtualized-ish scrollable message list, auto-scroll to bottom, group consecutive messages by same author

5. **New `src/components/community/ChatInput.tsx`** — message composer pinned to bottom with send button, optional image attachment

6. **New `src/components/community/ThreadPanel.tsx`** — slide-in panel showing thread replies for a parent message

7. **New `src/components/community/MessageBubble.tsx`** — single message row: avatar, name, timestamp, content, reaction bar, reply count badge

8. **Realtime subscription** in the chat hook to push new messages live without polling

### Design Approach (matching current aesthetic)
- Use existing `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground` tokens
- Rounded corners (`rounded-xl`) consistent with existing cards
- Channel sidebar uses same styling as AppShell navigation
- Messages use a clean left-aligned layout (avatar | content), not bubble-style
- Keep the warm, minimal feel — no dark Discord theme, stay with current light palette

### Migration from Posts
- Existing community_posts/post_comments/post_likes tables stay intact (used by Feed view)
- The space-level pages (`/community/city/:slug`, `/community/skill/:slug`) switch to the channel+chat model
- Feed view on `/community` continues to aggregate posts across all spaces

### Summary of Tasks
1. Create database migration (3 tables + seed channels + realtime)
2. Build `useCommunityChat` hook with realtime
3. Build channel sidebar, message list, chat input, thread panel components
4. Refactor `SpaceCommunity.tsx` to use the new Discord-style layout
5. Mobile responsive: channel selector as dropdown/sheet on small screens

