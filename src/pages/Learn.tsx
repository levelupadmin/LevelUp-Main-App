import { useEffect } from "react";
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

  return (
    <div>
      <div role="tablist" aria-label="Learn sections" className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-1 mb-7">
        <LayoutGroup id="learn-segments">
          {SEGMENTS.map((s) => {
            const active = seg === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                onClick={() => setSeg(s.key)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 text-sm transition-colors",
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
