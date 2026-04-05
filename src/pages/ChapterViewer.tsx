import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
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
} from "lucide-react";

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

const ChapterViewer = () => {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
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
      .single();

    const cid = sec?.course_id;
    setCourseId(cid || null);

    // Access check — if not free, verify access
    if (!ch.make_free && cid) {
      const isAdmin = profile?.role === "admin";
      if (!isAdmin) {
        const { data: access } = await supabase.rpc("has_course_access", {
          p_course_id: cid,
        });
        if (!access) {
          toast.error("Enrol to access this chapter");
          navigate(`/courses/${cid}`);
          return;
        }
      }
    }

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

    // Enrich QnA with user names and replies
    const qnaItems = (qnaRes.data || []) as any[];
    const qnaWithReplies: QnaItem[] = [];
    for (const q of qnaItems) {
      const { data: replies } = await supabase
        .from("chapter_qna_replies")
        .select("id, reply_text, user_id, is_instructor_reply, created_at")
        .eq("qna_id", q.id)
        .order("created_at");
      qnaWithReplies.push({ ...q, replies: replies || [] });
    }
    setQna(qnaWithReplies);
    setComments((commentsRes.data || []) as Comment[]);
    setLoading(false);
  }, [chapterId, user, profile, navigate]);

  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

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
    toast.success("Chapter completed!");
    setSubmitting(false);

    // Auto-advance to next
    if (currentIndex < siblings.length - 1) {
      setTimeout(() => navigate(`/chapters/${siblings[currentIndex + 1].id}`), 800);
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
      toast.success("Question posted");
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
      toast.success("Comment posted");
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

  if (!chapter) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
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
          {/* Video placeholder */}
          <div className="aspect-video bg-surface-2 rounded-[16px] border border-border flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-muted-foreground text-sm">{chapter.title}</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Video player placeholder</p>
            </div>
          </div>

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
                <p className="text-sm text-muted-foreground/60">No description available.</p>
              )}
              {chapter.article_body && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: chapter.article_body }} />
                </div>
              )}
            </TabsContent>

            {/* Resources */}
            <TabsContent value="resources" className="mt-4 space-y-2">
              {resources.length === 0 ? (
                <p className="text-sm text-muted-foreground/60">No resources for this chapter.</p>
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
                  <p className="text-sm text-muted-foreground/60">No questions yet. Be the first!</p>
                ) : (
                  qna.map((q) => (
                    <div key={q.id} className="border border-border rounded-lg p-3 space-y-2">
                      <p className="text-sm">{q.question_text}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(q.created_at).toLocaleDateString()}
                        {q.is_resolved && " · ✅ Resolved"}
                      </span>
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
                            {r.is_instructor_reply ? "Instructor" : ""}{" "}
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
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
                  <p className="text-sm text-muted-foreground/60">No comments yet.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="border border-border rounded-lg p-3">
                      <p className="text-sm">{c.comment_text}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))
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
