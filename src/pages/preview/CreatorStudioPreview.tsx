/**
 * CREATOR STUDIO — PLAYABLE PROTOTYPE (see PreviewShell for the layout story).
 *
 * Still zero database: `previewStore` (a reducer + localStorage) is the entire
 * backend. But the loop is now real — complete the day, submit the block, watch
 * Week 5 unlock, accept it at the mentor desk, place it in the Album.
 *
 * Motion doctrine, per the app's own DESIGN-STRATEGY.md ("physics, not
 * transitions"): screens hand over via AnimatePresence with a spring — nothing
 * snaps; the header stats pop when their value changes, so earning XP is felt
 * in the chrome, not just printed; and `prefers-reduced-motion` is respected
 * because the springs ride the app's motion-safe hook.
 */
import { useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { canSeePreview, previewHostAllowsAnonymous } from "./previewGate";
import PreviewShell from "./PreviewShell";
import { SHELL_TABS } from "./previewTabs";
import { usePlayState } from "./previewStore";
import {
  HomeScreen, PathScreen, SessionScreen, FeedScreen, AlbumScreen, MentorScreen, AdminScreen, BrainScreen,
} from "./PreviewScreens";

const TITLES: Record<string, string> = {
  home: "Home", path: "The Path", session: "The Path", brain: "Second Brain",
  album: "Creator OS", feed: "Feed", mentor: "Mentor desk", admin: "Admin",
};

export default function CreatorStudioPreview() {
  const { user, profile } = useAuth();
  const [screen, setScreen] = useState<string>("home");
  const [s, d] = usePlayState();
  const reduced = useReducedMotion();

  const go = useCallback((k: string) => setScreen(k), []);

  const anonymousOk = previewHostAllowsAnonymous(window.location.hostname);
  if (!anonymousOk && !canSeePreview({ id: user?.id ?? profile?.id, email: user?.email ?? profile?.email }))
    return <Navigate to="/home" replace />;

  const screens: Record<string, React.ReactNode> = {
    home: <HomeScreen s={s} d={d} go={go} />,
    path: <PathScreen s={s} d={d} go={go} />,
    session: <SessionScreen s={s} d={d} go={go} />,
    brain: <BrainScreen s={s} d={d} go={go} />,
    album: <AlbumScreen s={s} d={d} go={go} />,
    feed: <FeedScreen s={s} d={d} go={go} />,
    mentor: <MentorScreen s={s} d={d} go={go} />,
    admin: <AdminScreen s={s} />,
  };

  const activeTab = SHELL_TABS.some((t) => t.key === screen) ? screen : "path";

  return (
    <PreviewShell active={activeTab} onChange={setScreen} title={TITLES[screen] ?? "Creator Studio"} xp={s.xp} streak={s.streak}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screen}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          {screens[screen] ?? screens.home}
        </motion.div>
      </AnimatePresence>
    </PreviewShell>
  );
}
