import { useEffect, useRef, useState } from "react";
import { RotateCcw, Play, X } from "lucide-react";
import { hapticImpact, hapticSelection } from "@/lib/haptics";

/** Format whole-second offset as an M:SS (or H:MM:SS) clock for the pill. */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  }
  return `${m}:${r.toString().padStart(2, "0")}`;
}

interface ResumePillProps {
  /** Saved playback offset to resume from, in seconds. */
  seconds: number;
  /** Invoked when the student taps the pill; ChapterViewer seeks the player. */
  onResume: (seconds: number) => void;
  className?: string;
}

/**
 * "Resume from 12:34" cream pill. Surfaces a saved playback position so the
 * student can jump back in with one tap. Seek is delegated to onResume so the
 * player stays owned by ChapterViewer. Renders nothing for a zero/negative
 * offset (nothing to resume).
 */
export function ResumePill({ seconds, onResume, className }: ResumePillProps) {
  if (!seconds || seconds <= 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void hapticImpact("light");
        onResume(seconds);
      }}
      className={`pressable inline-flex items-center gap-2 rounded-full bg-[hsl(var(--cream))] px-4 py-2 text-sm font-medium text-[hsl(var(--cream-text))] shadow-lg shadow-black/30 min-h-[44px] ${
        className ?? ""
      }`}
    >
      <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
      <span>Resume from {clock(seconds)}</span>
    </button>
  );
}

interface AutoAdvanceCountdownProps {
  /** Title of the lesson that will play next. */
  nextTitle: string;
  /** Fired when the countdown reaches zero or the student taps "Play now". */
  onGo: () => void;
  /** Fired when the student cancels the auto-advance. */
  onCancel: () => void;
  /** Countdown length in seconds. Defaults to 5. */
  seconds?: number;
}

/**
 * A 5-second "Up next…" auto-advance card. Counts down with a sweeping cream
 * ring; reaching zero (or tapping "Play now") calls onGo, "Cancel" calls
 * onCancel. Honours prefers-reduced-motion by skipping the ring animation
 * (the numeric countdown still runs). Mount/unmount is the caller's job; it
 * renders nothing once mounted is decided by ChapterViewer.
 */
export function AutoAdvanceCountdown({
  nextTitle,
  onGo,
  onCancel,
  seconds = 5,
}: AutoAdvanceCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  // Keep the latest onGo without re-arming the interval each render.
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;
  const firedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          if (!firedRef.current) {
            firedRef.current = true;
            // Defer so we don't call a parent state update mid-render.
            window.setTimeout(() => onGoRef.current(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fraction = seconds > 0 ? remaining / seconds : 0;
  // SVG ring geometry (r=16, circumference ≈ 100.53).
  const RADIUS = 16;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = reduceMotion ? 0 : CIRC * (1 - fraction);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--cream))]/25 bg-black/85 backdrop-blur-sm p-3 shadow-xl shadow-black/40">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            stroke="hsl(var(--cream) / 0.18)"
            strokeWidth="3"
          />
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            stroke="hsl(var(--cream))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            style={{ transition: reduceMotion ? undefined : "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-[hsl(var(--cream))]">
          {remaining}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
          Up next
        </p>
        <p className="text-sm font-medium leading-tight line-clamp-2">{nextTitle}</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (firedRef.current) return;
            firedRef.current = true;
            void hapticImpact("light");
            onGo();
          }}
          className="pressable inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--cream))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--cream-text))] min-h-[44px]"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Play now
        </button>
        <button
          type="button"
          onClick={() => {
            void hapticSelection();
            onCancel();
          }}
          className="pressable inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground min-h-[44px]"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ResumePill;
