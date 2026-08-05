/**
 * CREATOR STUDIO — CLICKABLE PROTOTYPE
 *
 * 🔴 READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * This route is a PROTOTYPE, not a product. It exists so the shape of Creator
 * Studio can be judged on a real phone, in the real app, in the real design
 * system — before a single production table is touched.
 *
 * Three properties are load-bearing and must survive every edit:
 *
 *  1. **It reads and writes NOTHING.** No Supabase client is imported by this
 *     tree. Every number on screen is a literal in `previewData.ts`. That is
 *     what makes it safe to ship to a branch of an app with 457 live users:
 *     there is no code path from here to their data.
 *  2. **It is allowlisted to one address** (`previewGate.ts`). Not the `admin`
 *     role — see that file for why.
 *  3. **Dead buttons say they are dead.** Every inert control routes through
 *     `tap()`, which shows a toast naming the action and stating it isn't wired
 *     yet. A prototype that silently swallows taps teaches the reviewer that the
 *     product is broken; one that answers honestly teaches them the flow.
 *
 * When a screen graduates, delete it from here rather than "promoting" this
 * file — the real thing needs loading, error and empty states this deliberately
 * doesn't have.
 */
import { useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canSeePreview } from "./previewGate";
import {
  HomeScreen, PathScreen, SessionScreen, LockedScreen,
  FeedScreen, AlbumScreen, MentorScreen, AdminScreen,
} from "./PreviewScreens";

const TABS = [
  { key: "home", label: "Home" },
  { key: "path", label: "Path" },
  { key: "feed", label: "Feed" },
  { key: "album", label: "Album" },
  { key: "mentor", label: "Mentor" },
  { key: "admin", label: "Admin" },
] as const;

export default function CreatorStudioPreview() {
  const { user, profile } = useAuth();
  const [screen, setScreen] = useState<string>("home");

  /**
   * Acknowledge a tap on something that isn't built. Naming the action matters:
   * "Submit assignment isn't wired up yet" is a design review note, whereas a
   * silent no-op is indistinguishable from a bug.
   */
  const tap = useCallback((what: string) => {
    toast(`${what} — prototype`, { description: "Not wired up yet. This is here to judge the flow." });
  }, []);

  if (!canSeePreview({ id: user?.id ?? profile?.id, email: user?.email ?? profile?.email }))
    return <Navigate to="/home" replace />;

  const go = (k: string) => setScreen(k);

  const body = {
    home: <HomeScreen go={go} tap={tap} />,
    path: <PathScreen go={go} />,
    session: <SessionScreen tap={tap} />,
    locked: <LockedScreen go={go} tap={tap} />,
    feed: <FeedScreen tap={tap} />,
    album: <AlbumScreen tap={tap} />,
    mentor: <MentorScreen tap={tap} />,
    admin: <AdminScreen tap={tap} />,
  }[screen] ?? <HomeScreen go={go} tap={tap} />;

  return (
    <div className="mx-auto w-full max-w-lg pb-24">
      {/* A permanent, unmissable reminder that none of this is real. */}
      <div className="mb-3 rounded-[var(--radius)] border border-[hsl(var(--accent-violet)/0.4)] bg-[hsl(var(--accent-violet)/0.09)] px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--accent-violet))]">
          Prototype — nothing here is live
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
          Invented data, inert buttons, no database. Visible only to you.
        </p>
      </div>

      {/* Tab rail — mirrors how the room's own rail behaves on a phone. */}
      <nav
        aria-label="Prototype sections"
        className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const active = screen === t.key || (t.key === "path" && ["session", "locked"].includes(screen));
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setScreen(t.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-[hsl(var(--cream))] font-semibold text-[hsl(var(--cream-text))]"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {body}

      {(screen === "session" || screen === "locked") && (
        <button
          type="button"
          onClick={() => setScreen("path")}
          className="mt-5 text-[12px] text-[hsl(var(--muted-foreground))] underline underline-offset-4"
        >
          ← Back to the path
        </button>
      )}
    </div>
  );
}
