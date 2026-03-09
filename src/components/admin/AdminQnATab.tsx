import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Trash2, HelpCircle, CheckCircle, ChevronDown, ChevronRight, User, Send } from "lucide-react";

interface Props {
  courseId: string;
  lessons: { id: string; title: string; module_id: string }[];
  modules: { id: string; title: string }[];
}

const useQuestions = (courseId: string) =>
  useQuery({
    queryKey: ["admin-qna-questions", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qna_questions")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

const useAnswers = (questionIds: string[]) =>
  useQuery({
    queryKey: ["admin-qna-answers", questionIds],
    enabled: questionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qna_answers")
        .select("*")
        .in("question_id", questionIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

const useQnAProfiles = (userIds: string[]) =>
  useQuery({
    queryKey: ["profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
  });

export default function AdminQnATab({ courseId, lessons, modules }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set());

  const { data: questions = [], isLoading } = useQuestions(courseId);
  const questionIds = questions.map((q: any) => q.id);
  const { data: answers = [] } = useAnswers(questionIds);

  const allUserIds = [
    ...new Set([
      ...questions.map((q: any) => q.user_id),
      ...answers.map((a: any) => a.user_id),
    ]),
  ];
  const { data: profiles = [] } = useQnAProfiles(allUserIds);
  const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

  const answersByQuestion: Record<string, any[]> = {};
  answers.forEach((a: any) => {
    if (!answersByQuestion[a.question_id]) answersByQuestion[a.question_id] = [];
    answersByQuestion[a.question_id].push(a);
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("qna_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-qna-questions", courseId] });
      toast({ title: "Question deleted" });
    },
  });

  const resolveQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("qna_questions").update({ is_resolved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-qna-questions", courseId] });
      toast({ title: "Marked as resolved" });
    },
  });

  const postAnswer = useMutation({
    mutationFn: async ({ questionId, body }: { questionId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("qna_answers").insert({
        question_id: questionId,
        user_id: user.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-qna-answers"] });
      setAnsweringId(null);
      setAnswerText("");
      toast({ title: "Answer posted" });
    },
  });

  const deleteAnswer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("qna_answers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-qna-answers"] });
      toast({ title: "Answer deleted" });
    },
  });

  const filtered = questions.filter((q: any) => {
    if (filter === "open" && q.is_resolved) return false;
    if (filter === "resolved" && !q.is_resolved) return false;
    if (search) {
      const lesson = lessons.find((l) => l.id === q.lesson_id);
      return (
        q.title.toLowerCase().includes(search.toLowerCase()) ||
        (q.body || "").toLowerCase().includes(search.toLowerCase()) ||
        (lesson?.title || "").toLowerCase().includes(search.toLowerCase())
      );
    }
    return true;
  });

  const openCount = questions.filter((q: any) => !q.is_resolved).length;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <HelpCircle className="h-4 w-4" /> Q&A
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{questions.length} questions • {openCount} open</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["all", "open", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search questions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading questions...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">No questions found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q: any) => {
            const lesson = lessons.find((l) => l.id === q.lesson_id);
            const module = modules.find((m) => m.id === lesson?.module_id);
            const profile = profileMap[q.user_id];
            const qAnswers = answersByQuestion[q.id] || [];
            const isExpanded = expandedQ.has(q.id);

            return (
              <div key={q.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => {
                    const next = new Set(expandedQ);
                    next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                    setExpandedQ(next);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-sm font-medium text-foreground">{q.title}</span>
                        {q.is_resolved && <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">Resolved</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground ml-5">
                        <User className="h-3 w-3" />
                        <span>{profile?.name || "User"}</span>
                        <span>•</span>
                        <span>{lesson?.title || "Unknown lesson"}</span>
                        {module && <><span>•</span><span>{module.title}</span></>}
                        <span>•</span>
                        <span>{new Date(q.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{qAnswers.length} answers</span>
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    {q.body && <p className="text-sm text-foreground/80 bg-secondary/20 rounded-md p-3">{q.body}</p>}

                    {/* Answers */}
                    {qAnswers.length > 0 && (
                      <div className="space-y-2 ml-4 border-l-2 border-border pl-3">
                        {qAnswers.map((a: any) => {
                          const aProfile = profileMap[a.user_id];
                          return (
                            <div key={a.id} className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-xs font-medium text-foreground">{aProfile?.name || "Admin"}</span>
                                  {a.is_accepted && <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">Accepted</Badge>}
                                  <span className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-foreground/80">{a.body}</p>
                              </div>
                              <button onClick={() => deleteAnswer.mutate(a.id)} className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Answer input */}
                    {answeringId === q.id ? (
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Write your answer..."
                          value={answerText}
                          onChange={(e) => setAnswerText(e.target.value)}
                          className="min-h-[60px] text-sm flex-1"
                        />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" disabled={!answerText.trim() || postAnswer.isPending} onClick={() => postAnswer.mutate({ questionId: q.id, body: answerText })}>
                            <Send className="h-3 w-3 mr-1" /> Post
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setAnsweringId(null); setAnswerText(""); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setAnsweringId(q.id)}>
                          <Send className="h-3 w-3 mr-1" /> Answer
                        </Button>
                        {!q.is_resolved && (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); resolveQuestion.mutate(q.id); }}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Mark Resolved
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteQuestion.mutate(q.id); }}>
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
