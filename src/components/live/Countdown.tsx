import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticImpact } from "@/lib/haptics";

interface CountdownProps {
  /** The moment the session begins. ISO string or Date. */
  target: string | Date;
  /**
   * Where "Join" sends the user once the countdown reaches zero. Can be a
   * static URL or a lazy resolver (e.g. a gated RPC that mints the link on
   * click). If omitted, the morph still happens but renders a disabled Join.
   */
  joinUrl?: string | (() => Promise<string | null>) | null;
  /** Label for the morphed button. Defaults to "Join". */
  joinLabel?: string;
  className?: string;
}

interface Remaining {
  total: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const compute = (target: Date): Remaining => {
  const total = Math.max(0, target.getTime() - Date.now());
  const totalSeconds = Math.floor(total / 1000);
  return {
    total,
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Live countdown that MORPHS into a Join button at T-0.
 *
 * Before the target, it ticks a monospace hh:mm:ss clock in cream. The moment
 * the remaining time hits zero, the digits cross-fade out and a champagne
 * "Join" button fades in. `joinUrl` may be a string or an async resolver, so
 * the caller can keep using a gated RPC that only hands out the real link in
 * the narrow window around the session.
 */
export const Countdown = ({
  target,
  joinUrl,
  joinLabel = "Join",
  className,
}: CountdownProps) => {
  const targetDate = typeof target === "string" ? new Date(target) : target;
  const [remaining, setRemaining] = useState<Remaining>(() => compute(targetDate));
  const [opening, setOpening] = useState(false);

  const reached = remaining.total <= 0;

  useEffect(() => {
    if (reached) return;
    const id = window.setInterval(() => {
      setRemaining(compute(targetDate));
    }, 1000);
    return () => window.clearInterval(id);
  }, [targetDate.getTime(), reached]);

  const handleJoin = async () => {
    if (!joinUrl || opening) return;
    void hapticImpact("medium");
    let resolved: string | null;
    if (typeof joinUrl === "function") {
      setOpening(true);
      try {
        resolved = await joinUrl();
      } finally {
        setOpening(false);
      }
    } else {
      resolved = joinUrl;
    }
    if (resolved) {
      window.open(resolved, "_blank", "noopener,noreferrer");
    }
  };

  if (reached) {
    return (
      <button
        type="button"
        onClick={handleJoin}
        disabled={!joinUrl || opening}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium",
          "motion-safe:animate-fade-in transition-opacity pressable min-h-[44px] sm:min-h-0",
          joinUrl
            ? "btn-champagne hover:opacity-95"
            : "bg-[hsl(var(--accent-amber)/0.3)] text-muted-foreground cursor-not-allowed",
          className,
        )}
        aria-label={joinLabel}
      >
        {opening ? "Opening…" : joinLabel}
        {!opening && <ExternalLink className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-px font-mono tabular-nums text-cream tracking-tight",
        className,
      )}
      role="timer"
      aria-live="off"
      aria-label={`Starts in ${remaining.hours} hours ${remaining.minutes} minutes ${remaining.seconds} seconds`}
    >
      <span>{pad(remaining.hours)}</span>
      <span className="opacity-50">:</span>
      <span>{pad(remaining.minutes)}</span>
      <span className="opacity-50">:</span>
      <span>{pad(remaining.seconds)}</span>
    </span>
  );
};

export default Countdown;
