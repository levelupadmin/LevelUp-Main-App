import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, GraduationCap, CalendarClock, Users, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MotionCard } from "@/components/motion/MotionCard";
import { hapticSelection } from "@/lib/haptics";

// ── Quick Pick ──
// A 2×2 launchpad that sits right under the hero: the four highest-intent
// jumps for a member, each resolved to a live destination. Any tile whose
// target can't be resolved (no in-progress course, nothing scheduled, empty
// catalog) falls back to a sensible always-valid route, so the grid is
// always four complete tiles, never a dead cell.

interface QuickTile {
  key: string;
  icon: LucideIcon;
  eyebrow: string;
  label: string;
  to: string;
}

// Accent discipline (DESIGN-STRATEGY Pillar 1): the launchpad stays inside the
// champagne/cream/gold/violet family and spends at most one accent emphasis per
// moment. Cream is the default for every tile; the single highest-intent jump
// (resume/start a course) carries the one gold highlight. The old amber (LIVE)
// and emerald (NEW) one-offs are retired — same cleanup TierBadge got — so the
// grid no longer fights the champagne/cream system with four rival colours.
const ACCENT_VARS: Record<string, string> = {
  course: "--gold",
  session: "--cream",
  community: "--cream",
  catalog: "--cream",
};

interface QuickPickData {
  lastCourseId: string | null;
  newest: { title: string; to: string } | null;
}

// The two tiles that need data — resume target + newest catalog item — moved to
// react-query (P6-T1) so revisiting Home within staleTime fires zero refetches.
// The query shapes are UNCHANGED from the old inline load, deliberately: the
// last-touched course is read from the user's FULL chapter_progress (not the
// enrolment-scoped shared tree), so the "Jump back in" link resolves to the exact
// same course id as before. Folding it into the shared tree would scope it to
// enrolled courses and could change that link target — behavior preservation wins
// over sharing this one read.
const fetchQuickPick = async (
  userId: string | undefined
): Promise<QuickPickData> => {
  // 1) Last course the user touched, newest chapter_progress row.
  const lastCoursePromise = userId
    ? supabase
        .from("chapter_progress")
        .select("course_id, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null });

  // 2) Newest catalog item → its offering landing page (mirrors the catalog
  //    join: primary_offering_id, else first offering_courses row). Public
  //    /p/:slug when we have a slug, else the course page.
  const newestCoursePromise = supabase
    .from("courses")
    .select("id, title, primary_offering_id")
    .in("status", ["published", "upcoming"])
    .eq("show_on_browse", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [lastCourseRes, newestCourseRes] = await Promise.all([
    lastCoursePromise,
    newestCoursePromise,
  ]);

  const lastCourseId = lastCourseRes.data?.course_id ?? null;

  let newest: QuickPickData["newest"] = null;
  const nc = newestCourseRes.data;
  if (nc) {
    // Resolve the offering slug for a public landing link.
    let offeringId = nc.primary_offering_id as string | null;
    if (!offeringId) {
      const { data: oc } = await supabase
        .from("offering_courses")
        .select("offering_id")
        .eq("course_id", nc.id)
        .limit(1)
        .maybeSingle();
      offeringId = oc?.offering_id ?? null;
    }

    let to = `/courses/${nc.id}`;
    if (offeringId) {
      const { data: off } = await supabase
        .from("offerings")
        .select("slug")
        .eq("id", offeringId)
        .maybeSingle();
      if (off?.slug) to = `/p/${off.slug}`;
    }

    newest = { title: nc.title, to };
  }

  return { lastCourseId, newest };
};

const QuickPick = () => {
  const { user } = useAuth();
  // Resume target (last-touched course) and newest catalog item are the two
  // tiles that need a query; the other two are static routes.
  const { data, isPending } = useQuery({
    queryKey: ["quickpick", user?.id ?? "anon"],
    queryFn: () => fetchQuickPick(user?.id),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const lastCourseId = data?.lastCourseId ?? null;
  const newest = data?.newest ?? null;
  // Hold the skeleton only while the first fetch is in flight. On error the
  // query settles (isPending false) with no data, so the tiles fall back to
  // their always-valid routes — same end state as the old `finally`-driven
  // ready flag.
  const ready = !isPending;

  const tiles: QuickTile[] = [
    {
      key: "course",
      icon: GraduationCap,
      eyebrow: lastCourseId ? "Resume" : "Learn",
      label: lastCourseId ? "Jump back in" : "Start a course",
      // Last course if we have one; otherwise the catalog below (same page).
      to: lastCourseId ? `/courses/${lastCourseId}` : "/my-courses",
    },
    {
      key: "session",
      icon: CalendarClock,
      eyebrow: "Live",
      label: "Next session",
      to: "/my-sessions",
    },
    {
      key: "community",
      icon: Users,
      eyebrow: "Connect",
      label: "Community",
      to: "/community",
    },
    {
      key: "catalog",
      icon: Sparkles,
      eyebrow: "New",
      label: newest?.title ?? "Browse programs",
      to: newest?.to ?? "/my-courses",
    },
  ];

  // Hold layout until the two async tiles resolve, so labels don't flip from
  // a generic fallback to a specific one after paint (avoids a flash).
  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton-shimmer h-[88px] rounded-2xl"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3" role="navigation" aria-label="Quick links">
      {tiles.map((t) => {
        const Icon = t.icon;
        const accentVar = ACCENT_VARS[t.key];
        const accent = `hsl(var(${accentVar}))`;
        const accentTint = `hsl(var(${accentVar}) / 0.12)`;
        return (
          // Press/hover lift comes from MotionCard's shared snap/glide springs
          // (the same primitive YourWeek, ContinueLearning, and CatalogCard use),
          // NOT the legacy `.pressable` CSS — which scaled even under reduced
          // motion (no prefers-reduced-motion guard) and lived as a one-off. `asChild`
          // layers the springs onto the native <Link> so client-side routing and the
          // anchor role are preserved; the haptic onClick stays on the Link so
          // MotionCard remains non-interactive and never overrides that role.
          // tabIndex={0} is REQUIRED here: a non-interactive MotionCard resolves
          // tabIndex=-1 (MotionCard.tsx:104) and Slot merges it onto the anchor,
          // which would drop the tile from the keyboard tab order. Mirrors the
          // ContinueLearning/SurfaceCard Link paths. See MotionCard for the
          // reduced-motion / coarse-pointer gating.
          <MotionCard key={t.key} asChild tabIndex={0}>
            <Link
              to={t.to}
              onClick={() => {
                void hapticSelection();
              }}
              className="group relative overflow-hidden rounded-2xl bg-surface ring-1 ring-white/5 hover:ring-[hsl(var(--cream))]/30 transition-all duration-base p-4 min-h-[88px] flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))]"
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: accentTint }}
                >
                  <Icon className="h-4 w-4" style={{ color: accent }} />
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-[hsl(var(--cream))] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <div className="min-w-0">
                <p
                  className="text-[10px] font-mono uppercase tracking-[0.18em]"
                  style={{ color: accent }}
                >
                  {t.eyebrow}
                </p>
                <p className="text-sm font-semibold tracking-[-0.01em] line-clamp-1 mt-0.5">
                  {t.label}
                </p>
              </div>
            </Link>
          </MotionCard>
        );
      })}
    </div>
  );
};

export default QuickPick;
