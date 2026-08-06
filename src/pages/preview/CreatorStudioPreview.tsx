/**
 * CREATOR STUDIO — PLAYABLE PROTOTYPE (see PreviewShell for the layout story).
 *
 * Still zero database: `previewStore` (a reducer + localStorage) is the entire
 * backend. The loop is real — resume the recording, get handed to the block,
 * submit it, watch Week 5 unlock, accept it at the mentor desk, place it in
 * the Album, then like/comment your way through the feed.
 *
 * Navigation: `screen` is a string, optionally with a param — "recording/4",
 * "assignment/4", "doc/scr1". The shell's rail highlights the section the
 * sub-screen belongs to.
 */
import { useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { canSeePreview, previewHostAllowsAnonymous } from "./previewGate";
import PreviewShell from "./PreviewShell";
import { SHELL_TABS } from "./previewTabs";
import { usePlayState } from "./previewStore";
import { HomeScreen, PathScreen, RecordingScreen, AssignmentScreen, SessionDetailScreen } from "./PreviewScreens";
import { AlbumScreen, DocScreen, FeedScreen, MentorScreen } from "./PreviewStudioScreens";
import { AdminScreen, CohortLauncherScreen, TemplateStudioScreen } from "./PreviewAdminScreens";

const TITLES: Record<string, string> = {
  home: "Home", path: "The Path", recording: "The Path", assignment: "The Path",
  session: "The Path", album: "Creator OS", doc: "Creator OS",
  feed: "Feed", mentor: "Mentor desk", admin: "Admin",
};

/** Which rail tab a sub-screen belongs under. */
const TAB_FOR: Record<string, string> = {
  recording: "path", assignment: "path", session: "path", doc: "album",
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

  const [kind, param] = screen.split("/");

  const content = (() => {
    switch (kind) {
      case "path": return <PathScreen s={s} d={d} go={go} />;
      case "recording": return <RecordingScreen s={s} d={d} go={go} week={Number(param) || 4} />;
      case "assignment": return <AssignmentScreen s={s} d={d} go={go} />;
      case "session": return <SessionDetailScreen s={s} go={go} week={Number(param) || 4} />;
      case "album": return <AlbumScreen s={s} d={d} go={go} />;
      case "doc": return <DocScreen go={go} docId={param ?? "scr1"} />;
      case "feed": return <FeedScreen s={s} d={d} go={go} />;
      case "mentor": return <MentorScreen s={s} d={d} go={go} />;
      case "admin":
        if (param === "launch") return <CohortLauncherScreen s={s} d={d} go={go} />;
        if (param === "template") return <TemplateStudioScreen s={s} d={d} go={go} />;
        return <AdminScreen s={s} go={go} />;
      default: return <HomeScreen s={s} d={d} go={go} />;
    }
  })();

  const activeTab = SHELL_TABS.some((t) => t.key === kind) ? kind : TAB_FOR[kind] ?? "home";

  return (
    <PreviewShell
      active={activeTab}
      onChange={setScreen}
      title={TITLES[kind] ?? "Creator Studio"}
      xp={s.xp}
      streak={s.streak}
      onReset={() => d({ type: "reset" })}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screen}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </PreviewShell>
  );
}
