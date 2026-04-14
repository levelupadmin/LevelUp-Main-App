import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  HelpCircle,
  Info,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import VdoCipherPlayer from "@/components/VdoCipherPlayer";
import Confetti from "@/components/Confetti";
import { checkMilestone } from "@/hooks/useMilestone";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { checkAndGenerateCertificate } from "@/hooks/useCertificateAutoGenerate";

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

interface Comment {
  id: string;
  comment_text: string;
  user_id: string;
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

  // Load previous attempt on mount
  useEffect(() => {
    if (!userId || !quiz.id) { setLoadingAttempt(false); return; }
    (async () => {
      const { data: attempt } = await (supabase as any)
        .from("quiz_attempts")
        .select("id, score, total_questions, passed, answers")
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
        setResult({ score: attempt.score, total: attempt.total_questions, passed: attempt.passed });
        setSubmitted(true);
      }
      setLoadingAttempt(false);
    })();
  }, [quiz.id, userId]);

  const handleSubmit = async () => {
    if (questions.length === 0) return;
    let score = 0;
    const total = questions.length;

    questions.forEach((q: any) => {
      const selectedOptionId = answers[q.id];
      if (!selectedOptionId) return;
      const selectedOption = q.quiz_options.find((o: any) => o.id === selectedOptionId);
      if (selectedOption?.is_correct) score++;
    });

    const pct = (score / total) * 100;
    const passed = pct >= (quiz.pass_percentage || 70);

    setResult({ score, total, passed });
    setSubmitted(true);

    // Save attempt
    if (userId) {
      await (supabase as any).from("quiz_attempts").insert({
        quiz_id: quiz.id,
        user_id: userId,
        score,
        total_questions: total,
        passed,
        answers,
      });
    }

    if (passed) {
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
  const [siblings, setSiblings] = useState<{ id: string; title: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [qna, setQna] = useState<QnaItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [questionText, setQuestionText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [qnaLimit, setQnaLimit] = useState(20);
  const [commentLimit, setCommentLimit] = useState(20);
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

    // Fetch course title for breadcrumb
    if (cid) {
      const { data: courseData } = await supabase
        .from("courses")
        .select("title")
        .eq("id", cid)
        .maybeSingle();
      setCourseTitle(courseData?.title || null);
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
          .select("id, title, section_id, sort_order")
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
          setSiblings(sorted.map((c) => ({ id: c.id, title: c.title })));
          setCurrentIndex(sorted.findIndex((c) => c.id === chapterId));
        }
      }
    }

    // Load progress, resources, qna, comments in parallel
    const [progressRes, resourcesRes, qnaRes, commentsRes] = await Promise.all([
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
      supabase
        .from("chapter_comments")
        .select("id, comment_text, user_id, created_at")
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

    // Batch-fetch user names for QnA, replies, and comments
    const allUserIds = new Set<string>();
    qnaItems.forEach((q: any) => allUserIds.add(q.user_id));
    allReplies.forEach((r: any) => allUserIds.add(r.user_id));
    ((commentsRes.data || []) as any[]).forEach((c: any) => allUserIds.add(c.user_id));
    let userNameMap: Record<string, string> = {};
    if (allUserIds.size > 0) {
      const { data: users } = await supabase
        .from("users").select("id, full_name").in("id", [...allUserIds]);
      (users || []).forEach((u) => { userNameMap[u.id] = u.full_name || "Anonymous"; });
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
    setComments(((commentsRes.data || []) as any[]).map((c) => ({
      ...c,
      user_name: userNameMap[c.user_id] || "Anonymous",
    })));

    // Fetch quizzes for this chapter
    const { data: quizData } = await (supabase as any)
      .from("chapter_quizzes")
      .select("id, title, description, pass_percentage, sort_order, quiz_questions(id, question_text, question_type, explanation, sort_order, quiz_options(id, option_text, is_correct, sort_order))")
      .eq("chapter_id", chapterId)
      .eq("is_active", true)
      .order("sort_order");
    if (quizData) setQuizzes(quizData);

    setLoading(false);
  }, [chapterId, user, profile, navigate]);

  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

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
      autoAdvanceTimerRef.current = setTimeout(() => navigate(`/chapters/${siblings[currentIndex + 1].id}`), advanceDelay);
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
      loadChapter();
    }
    setSubmitting(false);
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !user || !chapterId) return;
    setSubmitting(true);
    const { error } = await supabase.from("chapter_comments").insert({
      chapter_id: chapterId,
      user_id: user.id,
      comment_text: commentText.trim(),
    });
    if (error) toast.error("Failed to post comment");
    else {
      toast.success("Comment added!");
      setCommentText("");
      loadChapter();
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
    <div className="min-h-screen bg-background text-foreground">
      <Confetti active={showConfetti} />
      {milestone && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] milestone-banner">
          <div className="bg-card border border-border rounded-2xl px-6 py-4 shadow-2xl text-center max-w-sm">
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
          <div className="bg-card border border-border rounded-2xl px-8 py-8 shadow-2xl text-center max-w-md mx-4">
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
      <div className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border px-4 h-14 flex items-center gap-3">
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

      <div className="flex flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 p-4 lg:p-8 space-y-6 max-w-4xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 flex-wrap">
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
          {/* Content renderer */}
          {chapter.content_type === "video" && (chapter as any).video_type === "vdocipher" && (chapter as any).vdocipher_video_id ? (
            <VdoCipherPlayer chapterId={chapter.id} onProgress={updateProgress} startPosition={lastPosition} />
          ) : chapter.content_type === "video" && (chapter.media_url || chapter.embed_url) ? (
            <div className="aspect-video bg-card rounded-[16px] border border-border overflow-hidden">
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
            <div className="w-full rounded-[16px] border border-border overflow-hidden bg-card" style={{ height: "80vh" }}>
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

          {/* Chapter info */}
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">{chapter.title}</h1>
            {chapter.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {chapter.description}
              </p>
            )}

            {!isCompleted && (
              <Button onClick={handleMarkComplete} disabled={submitting} size="lg">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Complete
              </Button>
            )}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex <= 0}
              onClick={() => navigate(`/chapters/${siblings[currentIndex - 1]?.id}`)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {siblings.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentIndex >= siblings.length - 1}
              onClick={() => navigate(`/chapters/${siblings[currentIndex + 1]?.id}`)}
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

        {/* Right sidebar */}
        <div className="lg:w-[380px] border-t lg:border-t-0 lg:border-l border-border p-4 lg:p-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="overview" className="text-xs gap-1">
                <Info className="h-3 w-3" /> Overview
              </TabsTrigger>
              <TabsTrigger value="resources" className="text-xs gap-1">
                <FileText className="h-3 w-3" /> Files
              </TabsTrigger>
              <TabsTrigger value="qna" className="text-xs gap-1">
                <HelpCircle className="h-3 w-3" /> Q&A
                {qna.some((q) => q.replies.some((r) => r.is_instructor_reply) && q.user_id === user?.id && !q.is_resolved) && (
                  <span className="ml-0.5 h-2 w-2 rounded-full bg-[hsl(var(--accent-emerald))] animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger value="comments" className="text-xs gap-1">
                <MessageSquare className="h-3 w-3" /> Chat
              </TabsTrigger>
            </TabsList>

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
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chapter.article_body, { ALLOWED_TAGS: ['p','br','strong','b','em','i','u','h1','h2','h3','h4','h5','h6','ul','ol','li','a','code','pre','blockquote','img','table','thead','tbody','tr','th','td','hr','span','div','figure','figcaption','sup','sub'], ALLOWED_ATTR: ['href','target','rel','src','alt','width','height','class','id','style'] }) }} />
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

            {/* Q&A */}
            <TabsContent value="qna" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Ask a question…"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handlePostQuestion}
                  disabled={!questionText.trim() || submitting}
                >
                  Post Question
                </Button>
              </div>
              <div className="space-y-3">
                {qna.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60">No questions yet — ask away, your instructor's listening.</p>
                ) : (
                  qna.slice(0, qnaLimit).map((q) => (
                    <div key={q.id} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{q.user_name || "Anonymous"}</span>
                        <span className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</span>
                        {q.is_resolved && <span className="text-xs text-[hsl(var(--accent-emerald))]">Resolved</span>}
                        {!q.is_resolved && q.replies.some((r) => r.is_instructor_reply) && (
                          <span className="text-xs text-[hsl(var(--accent-emerald))]">Answered</span>
                        )}
                      </div>
                      <p className="text-sm">{q.question_text}</p>
                      {q.replies.map((r) => (
                        <div
                          key={r.id}
                          className={`ml-4 pl-3 border-l-2 text-sm ${
                            r.is_instructor_reply
                              ? "border-emerald-500/50 text-emerald-300"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <p>{r.reply_text}</p>
                          <span className="text-xs opacity-60">
                            {r.is_instructor_reply ? "Instructor" : (r.user_name || "")}{" "}
                            · {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
                {qna.length > qnaLimit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setQnaLimit((prev) => prev + 20)}
                  >
                    Show more questions ({qna.length - qnaLimit} remaining)
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Comments */}
            <TabsContent value="comments" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Write a comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handlePostComment}
                  disabled={!commentText.trim() || submitting}
                >
                  Post Comment
                </Button>
              </div>
              <div className="space-y-3">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60">Be the first to start the conversation.</p>
                ) : (
                  comments.slice(0, commentLimit).map((c) => (
                    <div key={c.id} className="border border-border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{c.user_name || "Anonymous"}</span>
                        <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm">{c.comment_text}</p>
                    </div>
                  ))
                )}
                {comments.length > commentLimit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setCommentLimit((prev) => prev + 20)}
                  >
                    Show more comments ({comments.length - commentLimit} remaining)
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
