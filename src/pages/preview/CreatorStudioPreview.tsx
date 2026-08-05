/**
 * CREATOR STUDIO — CLICKABLE PROTOTYPE
 *
 * 🔴 READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * This route is a PROTOTYPE, not a product. It exists so the shape of Creator
 * Studio can be judged on a real phone AND a real monitor, in the real app, in
 * the real design system — before a single production table is touched.
 *
 * Four properties are load-bearing and must survive every edit:
 *
 *  1. **It reads and writes NOTHING.** No Supabase client is imported by this
 *     tree. Every number on screen is a literal in `previewData.ts`. That is
 *     what makes it safe to ship to a branch of an app with 457 live users:
 *     there is no code path from here to their data.
 *  2. **It is allowlisted** (`previewGate.ts`) — by auth user id first, because
 *     this app's primary login is phone OTP and email is not always present.
 *  3. **Dead buttons say they are dead.** Every inert control routes through
 *     `tap()`, which toasts the action's own name. A prototype that silently
 *     swallows taps teaches the reviewer that the product is broken; one that
 *     answers honestly teaches them the flow.
 *  4. **Mobile and desktop are different layouts, not one layout stretched.**
 *     See `PreviewShell.tsx` — this is the correction to v1, which was a single
 *     phone-width column that read as "hacked" on a monitor.
 *
 * When a screen graduates, delete it from here rather than "promoting" this
 * file — the real thing needs loading, error and empty states this deliberately
 * doesn't have.
 */
import { useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canSeePreview, previewHostAllowsAnonymous } from "./previewGate";
import PreviewShell from "./PreviewShell";
import { SHELL_TABS } from "./previewTabs";
import PathwayBoard from "./PathwayBoard";
import {
  HomeScreen, SessionScreen, LockedScreen,
  FeedScreen, AlbumScreen, MentorScreen, AdminScreen, BrainScreen,
} from "./PreviewScreens";

const TITLES: Record<string, string> = {
  home: "Home",
  path: "The Path",
  session: "The Path",
  locked: "The Path",
  brain: "Second Brain",
  album: "Creator OS",
  feed: "Feed",
  mentor: "Mentor desk",
  admin: "Admin",
};

export default function CreatorStudioPreview() {
  const { user, profile } = useAuth();
  const [screen, setScreen] = useState<string>("home");

  const tap = useCallback((what: string) => {
    toast(`${what} — prototype`, { description: "Not wired up yet. This is here to judge the flow." });
  }, []);

  const anonymousOk = previewHostAllowsAnonymous(window.location.hostname);
  if (!anonymousOk && !canSeePreview({ id: user?.id ?? profile?.id, email: user?.email ?? profile?.email }))
    return <Navigate to="/home" replace />;

  const go = (k: string) => setScreen(k);

  const body = {
    home: <HomeScreen go={go} tap={tap} />,
    path: <PathwayBoard onOpenDay={() => go("session")} />,
    session: <SessionScreen tap={tap} onBack={() => go("path")} />,
    locked: <LockedScreen go={go} tap={tap} />,
    brain: <BrainScreen tap={tap} />,
    album: <AlbumScreen tap={tap} />,
    feed: <FeedScreen tap={tap} />,
    mentor: <MentorScreen tap={tap} />,
    admin: <AdminScreen tap={tap} />,
  }[screen] ?? <HomeScreen go={go} tap={tap} />;

  // A sub-screen (a day, a locked week) keeps its parent tab lit.
  const activeTab = SHELL_TABS.some((t) => t.key === screen) ? screen : "path";

  return (
    <PreviewShell active={activeTab} onChange={setScreen} title={TITLES[screen] ?? "Creator Studio"}>
      {body}
    </PreviewShell>
  );
}
