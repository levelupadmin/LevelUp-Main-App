import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Props {
  lessonId: string;
  courseId: string;
}

const LessonQnAThread = ({ lessonId, courseId }: Props) => {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["lesson-qna", lessonId],
    enabled: !!lessonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qna_questions")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: answers = [] } = useQuery({
    queryKey: ["lesson-qna-answers", lessonId],
    enabled: questions.length > 0,
    queryFn: async () => {
      const qIds = questions.map((q) => q.id);
      const { data, error } = await supabase
        .from("qna_answers")
        .select("*")
        .in("question_id", qIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["qna-profiles", lessonId],
    enabled: questions.length > 0,
    queryFn: async () => {
      const userIds = [
        ...new Set([...questions.map((q) => q.user_id), ...answers.map((a) => a.user_id)]),
      ];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
  });

  const askQuestion = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("qna_questions").insert({
        lesson_id: lessonId,
        course_id: courseId,
        user_id: user.id,
        title: newTitle,
        body: newBody || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-qna", lessonId] });
      setAskOpen(false);
      setNewTitle("");
      setNewBody("");
    },
  });

  const postAnswer = useMutation({
    mutationFn: async (questionId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("qna_answers").insert({
        question_id: questionId,
        user_id: user.id,
        body: answerText,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-qna-answers", lessonId] });
      setAnswerText("");
    },
  });

  const getProfile = (userId: string) => profiles.find((p) => p.id === userId);

  return (
    <div className="space-y-4">
      {/* Ask Question button */}
      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 w-full">
            <HelpCircle className="h-3.5 w-3.5" /> Ask a Question
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask a Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Question title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              placeholder="Details (optional)"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <Button
              onClick={() => askQuestion.mutate()}
              disabled={!newTitle.trim() || askQuestion.isPending}
              className="w-full"
            >
              Post Question
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Questions list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
      ) : questions.length === 0 ? (
        <div className="text-center py-8">
          <HelpCircle className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No questions yet. Ask the first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => {
            const p = getProfile(q.user_id);
            const qAnswers = answers.filter((a) => a.question_id === q.id);
            const isExpanded = expandedQ === q.id;
            return (
              <div key={q.id} className="rounded-lg border border-border bg-card">
                <button
                  onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {q.is_resolved && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" /> Resolved
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {qAnswers.length} {qAnswers.length === 1 ? "answer" : "answers"}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{q.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{p?.name || "User"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                    {q.body && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{q.body}</p>
                    )}
                    {/* Answers */}
                    {qAnswers.map((a) => {
                      const ap = getProfile(a.user_id);
                      return (
                        <div key={a.id} className="flex gap-2 rounded-md bg-secondary/30 p-2.5">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={ap?.avatar_url || ""} />
                            <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                              {ap?.name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">{ap?.name || "User"}</span>
                              {a.is_accepted && (
                                <Badge variant="secondary" className="text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))] mr-0.5" /> Accepted
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.body}</p>
                          </div>
                        </div>
                      );
                    })}
                    {/* Post answer */}
                    <div className="flex gap-2">
                      <Textarea
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="Write an answer..."
                        className="min-h-[40px] resize-none bg-background text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        disabled={!answerText.trim() || postAnswer.isPending}
                        onClick={() => postAnswer.mutate(q.id)}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LessonQnAThread;
