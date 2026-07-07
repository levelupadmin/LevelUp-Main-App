// QA HARNESS — NOT shipped. Mounts the REAL completion-arc components
// (ProgressRing, CompletionTakeover, CompletionRecap) and replicates
// ChapterViewer's exact ArcPhase state machine + body-scroll-lock ownership so
// the live overlay-exit / reduced-motion / post-completion-scroll checks can be
// captured with Playwright without needing prod auth or a real chapter_progress
// write. The arc sequencing here is a faithful copy of
// src/pages/ChapterViewer.tsx (the CompletionTakeover/CompletionRecap render
// block + handleMarkComplete beats).
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ProgressRing from "@/components/progress/ProgressRing";
import CompletionTakeover from "@/components/chapter/CompletionTakeover";
import { CompletionRecap } from "@/components/progress/CompletionRecap";
import { useMotionSafe } from "@/lib/motion";
import "@/index.css";

type ArcPhase = "idle" | "takeover" | "recapWait" | "recap" | "recapOut";

function Harness() {
  const motionSafe = useMotionSafe();
  const [arcPhase, setArcPhase] = useState<ArcPhase>("idle");
  const [courseCompleted, setCourseCompleted] = useState(11);
  const courseTotal = 12;
  const arcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coursePct = Math.round((courseCompleted / courseTotal) * 100);

  // Mirror handleMarkComplete's final beats: ring sweeps in place, then (course
  // finished) the takeover enters once the ring settles. Reduced motion cuts the
  // beat to 0 but preserves the ring → takeover → recap ORDER.
  const startArc = () => {
    setCourseCompleted(courseTotal); // ring sweeps 11/12 → 12/12 in place
    if (arcTimerRef.current) clearTimeout(arcTimerRef.current);
    const beat = motionSafe.reduced ? 0 : 900;
    arcTimerRef.current = setTimeout(() => setArcPhase("takeover"), beat);
  };

  useEffect(() => {
    // Deterministic control surface for the Playwright driver.
    (window as unknown as Record<string, unknown>).__arc = {
      start: startArc,
      setPhase: (p: ArcPhase) => setArcPhase(p),
      phase: () => arcPhase,
      bodyOverflow: () => document.body.style.overflow,
      reduced: () => motionSafe.reduced,
    };
    (window as unknown as Record<string, unknown>).__arcReady = true;
  });

  return (
    <div style={{ minHeight: "320vh", padding: "24px" }}>
      <div
        data-testid="ring-slot"
        style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}
      >
        {/* Same call site as ChapterViewer: emphasis sweep, in place. */}
        <ProgressRing pct={coursePct} size={44} emphasis label />
        <span style={{ fontFamily: "monospace", color: "hsl(var(--cream))" }}>
          {coursePct}% complete · phase={arcPhase}
        </span>
      </div>

      <button
        data-testid="start-arc"
        onClick={startArc}
        className="btn-champagne pressable"
        style={{
          minHeight: 48,
          padding: "0 20px",
          borderRadius: 999,
          fontWeight: 600,
          color: "hsl(var(--cream-text))",
        }}
      >
        Mark complete (start arc)
      </button>

      <div style={{ marginTop: 32, maxWidth: 720 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "hsl(var(--foreground))" }}>
          Screening room (scroll target)
        </h1>
        {Array.from({ length: 40 }).map((_, i) => (
          <p key={i} style={{ color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }}>
            Filler paragraph {i + 1} — this long body exists so the post-completion
            body-scroll check has somewhere to scroll to after every overlay is
            dismissed. If the body-overflow lock leaked, this would be frozen.
          </p>
        ))}
      </div>

      {/* ── The completion arc — a faithful copy of ChapterViewer's render ── */}
      <CompletionTakeover
        open={arcPhase === "takeover"}
        variant="course"
        title="Filmmaking with Nelson Dilipkumar"
        subtitle="You've finished every lesson. Onwards."
        artUrl={null}
        continueLabel="See your recap"
        onContinue={() => setArcPhase("recapWait")}
        onShare={() => {}}
        onClose={() => setArcPhase("recapWait")}
        onExited={() => setArcPhase((p) => (p === "recapWait" ? "recap" : p))}
      />
      <CompletionRecap
        open={arcPhase === "recap"}
        onClose={() => setArcPhase("recapOut")}
        onExited={() => setArcPhase("idle")}
        courseTitle="Filmmaking with Nelson Dilipkumar"
        instructorName="Nelson Dilipkumar"
        lessonsCompleted={courseTotal}
        minutesWatched={214}
        imageUrl={null}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
