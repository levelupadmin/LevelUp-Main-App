import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import MyCoursesPage from "./MyCoursesPage";
import MySessionsPage from "./MySessionsPage";
import EventsPage from "./EventsPage";
import { cn } from "@/lib/utils";
import { useMotionSafe, durations, easings } from "@/lib/motion";
import { tapTick } from "@/lib/haptics";

// "Learn" merges the old My Courses / Sessions / Events tabs behind one tab with
// a segmented control. The old routes redirect here (?seg=…) so deep links and
// the shipped Capacitor binary keep resolving. Each segment renders the existing
// page unchanged — its own data fetching + heading carry over.
const SEGMENTS = [
  { key: "courses", label: "Courses" },
  { key: "live", label: "Live" },
  { key: "calendar", label: "Events" },
] as const;
type Seg = (typeof SEGMENTS)[number]["key"];

export default function Learn() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("seg");
  const seg: Seg = (SEGMENTS.some((s) => s.key === raw) ? raw : "courses") as Seg;
  const setSeg = (k: Seg) => {
    if (k === seg) return;
    void tapTick();
    setParams({ seg: k }, { replace: true });
  };
  useEffect(() => { window.scrollTo({ top: 0 }); }, [seg]);

  const motionSafe = useMotionSafe();

  // Roving-tabindex focus management: only the active tab is tabbable, and
  // Left/Right/Home/End move both selection and DOM focus between tabs per the
  // WAI-ARIA tabs pattern (automatic activation).
  const tabRefs = useRef<Record<Seg, HTMLButtonElement | null>>({
    courses: null,
    live: null,
    calendar: null,
  });
  const focusSeg = (k: Seg) => {
    setSeg(k);
    tabRefs.current[k]?.focus();
  };
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = SEGMENTS.findIndex((s) => s.key === seg);
    let next: Seg | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = SEGMENTS[(i + 1) % SEGMENTS.length].key;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = SEGMENTS[(i - 1 + SEGMENTS.length) % SEGMENTS.length].key;
        break;
      case "Home":
        next = SEGMENTS[0].key;
        break;
      case "End":
        next = SEGMENTS[SEGMENTS.length - 1].key;
        break;
      default:
        return;
    }
    e.preventDefault();
    focusSeg(next);
  };

  return (
    <div>
      <div role="tablist" aria-label="Learn sections" className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-1 mb-7">
        <LayoutGroup id="learn-segments">
          {SEGMENTS.map((s) => {
            const active = seg === s.key;
            return (
              <button
                key={s.key}
                ref={(el) => { tabRefs.current[s.key] = el; }}
                id={`learn-tab-${s.key}`}
                role="tab"
                aria-selected={active}
                aria-controls={`learn-panel-${s.key}`}
                tabIndex={active ? 0 : -1}
                onKeyDown={onTabKeyDown}
                onClick={() => setSeg(s.key)}
                className={cn(
                  // Tokenized colour cross-fade (duration-base ease-out) so the
                  // active-label colour eases in step with the pill glide rather
                  // than snapping mid-flight (default transition-colors is a fast
                  // synchronous swap that flickers legibility while the pill moves).
                  "relative rounded-full px-4 py-1.5 text-sm transition-colors duration-base ease-out-expo",
                  active
                    ? "text-[hsl(var(--cream-text))] font-medium"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                {/* Sliding active pill — cream family per accent discipline.
                    Shared layoutId glides the pill between segments on the
                    glide spring (instant under reduced motion). Sits behind the
                    label; label colour flips to cream-text for contrast. */}
                {active && (
                  <motion.span
                    layoutId="learn-segment-pill"
                    className="absolute inset-0 rounded-full bg-[hsl(var(--cream))]"
                    transition={motionSafe.springs.glide}
                  />
                )}
                <span className="relative z-10">{s.label}</span>
              </button>
            );
          })}
        </LayoutGroup>
      </div>

      {/* Fast tokenized crossfade between the three segment pages. Absolute
          exit keeps the swap from double-stacking height mid-transition. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={seg}
          id={`learn-panel-${seg}`}
          role="tabpanel"
          aria-labelledby={`learn-tab-${seg}`}
          tabIndex={0}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            motionSafe.reduced
              ? { duration: 0 }
              : { duration: durations.fast, ease: easings.out }
          }
        >
          {seg === "courses" && <MyCoursesPage />}
          {seg === "live" && <MySessionsPage />}
          {seg === "calendar" && <EventsPage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
