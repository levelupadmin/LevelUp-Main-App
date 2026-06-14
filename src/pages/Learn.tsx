import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import MyCoursesPage from "./MyCoursesPage";
import MySessionsPage from "./MySessionsPage";
import EventsPage from "./EventsPage";
import { cn } from "@/lib/utils";

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
  const setSeg = (k: Seg) => setParams({ seg: k }, { replace: true });
  useEffect(() => { window.scrollTo({ top: 0 }); }, [seg]);

  return (
    <div>
      <div role="tablist" aria-label="Learn sections" className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-1 mb-7">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={seg === s.key}
            onClick={() => setSeg(s.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              seg === s.key
                ? "bg-[hsl(var(--accent-amber)/0.16)] text-[hsl(var(--accent-amber))] font-medium"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {seg === "courses" && <MyCoursesPage />}
      {seg === "live" && <MySessionsPage />}
      {seg === "calendar" && <EventsPage />}
    </div>
  );
}
