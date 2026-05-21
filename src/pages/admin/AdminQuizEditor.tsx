import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";

interface QuizOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: "mcq" | "true_false";
  explanation: string;
  sort_order: number;
  quiz_options: QuizOption[];
}

interface Quiz {
  id: string;
  title: string;
  description: string;
  pass_percentage: number;
  is_active: boolean;
  sort_order: number;
  quiz_questions: QuizQuestion[];
}

let tempIdCounter = 0;
function tempId() {
  tempIdCounter += 1;
  return `_new_${Date.now()}_${tempIdCounter}`;
}

const AdminQuizEditor = () => {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!chapterId) return;
    setLoading(true);

    const { data: ch } = await supabase
      .from("chapters")
      .select("title")
      .eq("id", chapterId)
      .maybeSingle();
    setChapterTitle(ch?.title || "");

    const { data } = await (supabase as any)
      .from("chapter_quizzes")
      .select("id, title, description, pass_percentage, is_active, sort_order, quiz_questions(id, question_text, question_type, explanation, sort_order, quiz_options(id, option_text, is_correct, sort_order))")
      .eq("chapter_id", chapterId)
      .order("sort_order");

    if (data) {
      const sorted = (data as Quiz[]).map((q) => ({
        ...q,
        quiz_questions: (q.quiz_questions || [])
          .sort((a: QuizQuestion, b: QuizQuestion) => a.sort_order - b.sort_order)
          .map((qq: QuizQuestion) => ({
            ...qq,
            quiz_options: (qq.quiz_options || []).sort(
              (a: QuizOption, b: QuizOption) => a.sort_order - b.sort_order
            ),
          })),
      }));
      setQuizzes(sorted);
    }
    setLoading(false);
  }, [chapterId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addQuiz = () => {
    setQuizzes((prev) => [
      ...prev,
      {
        id: tempId(),
        title: "New Quiz",
        description: "",
        pass_percentage: 70,
        is_active: true,
        sort_order: prev.length,
        quiz_questions: [],
      },
    ]);
  };

  const removeQuiz = (idx: number) => {
    setQuizzes((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuiz = (idx: number, field: keyof Quiz, value: any) => {
    setQuizzes((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const addQuestion = (quizIdx: number) => {
    setQuizzes((prev) =>
      prev.map((q, i) =>
        i === quizIdx
          ? {
              ...q,
              quiz_questions: [
                ...q.quiz_questions,
                {
                  id: tempId(),
                  question_text: "",
                  question_type: "mcq" as const,
                  explanation: "",
                  sort_order: q.quiz_questions.length,
                  quiz_options: [
                    { id: tempId(), option_text: "Option A", is_correct: true, sort_order: 0 },
                    { id: tempId(), option_text: "Option B", is_correct: false, sort_order: 1 },
                  ],
                },
              ],
            }
          : q
      )
    );
  };

  const removeQuestion = (quizIdx: number, qIdx: number) => {
    setQuizzes((prev) =>
      prev.map((q, i) =>
        i === quizIdx
          ? { ...q, quiz_questions: q.quiz_questions.filter((_, j) => j !== qIdx) }
          : q
      )
    );
  };

  const updateQuestion = (quizIdx: number, qIdx: number, field: keyof QuizQuestion, value: any) => {
    setQuizzes((prev) =>
      prev.map((q, qi) =>
        qi === quizIdx
          ? {
              ...q,
              quiz_questions: q.quiz_questions.map((qq, qj) =>
                qj === qIdx ? { ...qq, [field]: value } : qq
              ),
            }
          : q
      )
    );
  };

  const addOption = (quizIdx: number, qIdx: number) => {
    setQuizzes((prev) =>
      prev.map((q, qi) =>
        qi === quizIdx
          ? {
              ...q,
              quiz_questions: q.quiz_questions.map((qq, qj) =>
                qj === qIdx
                  ? {
                      ...qq,
                      quiz_options: [
                        ...qq.quiz_options,
                        { id: tempId(), option_text: "", is_correct: false, sort_order: qq.quiz_options.length },
                      ],
                    }
                  : qq
              ),
            }
          : q
      )
    );
  };

  const removeOption = (quizIdx: number, qIdx: number, oIdx: number) => {
    setQuizzes((prev) =>
      prev.map((q, qi) =>
        qi === quizIdx
          ? {
              ...q,
              quiz_questions: q.quiz_questions.map((qq, qj) =>
                qj === qIdx
                  ? { ...qq, quiz_options: qq.quiz_options.filter((_, oi) => oi !== oIdx) }
                  : qq
              ),
            }
          : q
      )
    );
  };

  const updateOption = (quizIdx: number, qIdx: number, oIdx: number, field: keyof QuizOption, value: any) => {
    setQuizzes((prev) =>
      prev.map((q, qi) =>
        qi === quizIdx
          ? {
              ...q,
              quiz_questions: q.quiz_questions.map((qq, qj) =>
                qj === qIdx
                  ? {
                      ...qq,
                      quiz_options: qq.quiz_options.map((o, oi) =>
                        oi === oIdx ? { ...o, [field]: value } : o
                      ),
                    }
                  : qq
              ),
            }
          : q
      )
    );
  };

  const setCorrectOption = (quizIdx: number, qIdx: number, oIdx: number) => {
    setQuizzes((prev) =>
      prev.map((q, qi) =>
        qi === quizIdx
          ? {
              ...q,
              quiz_questions: q.quiz_questions.map((qq, qj) =>
                qj === qIdx
                  ? {
                      ...qq,
                      quiz_options: qq.quiz_options.map((o, oi) => ({
                        ...o,
                        is_correct: oi === oIdx,
                      })),
                    }
                  : qq
              ),
            }
          : q
      )
    );
  };

  const handleSave = async () => {
    if (!chapterId) return;

    // Validate before saving
    for (let qi = 0; qi < quizzes.length; qi++) {
      const quiz = quizzes[qi];
      if (!quiz.title.trim()) {
        toast({ title: `Quiz ${qi + 1} needs a title`, variant: "destructive" });
        return;
      }
      if (quiz.quiz_questions.length === 0) {
        toast({ title: `Quiz "${quiz.title}" has no questions`, variant: "destructive" });
        return;
      }
      for (let qqi = 0; qqi < quiz.quiz_questions.length; qqi++) {
        const q = quiz.quiz_questions[qqi];
        if (!q.question_text.trim()) {
          toast({ title: `Quiz "${quiz.title}", Q${qqi + 1}: question text is empty`, variant: "destructive" });
          return;
        }
        if (q.quiz_options.length < 2) {
          toast({ title: `Quiz "${quiz.title}", Q${qqi + 1}: needs at least 2 options`, variant: "destructive" });
          return;
        }
        const hasCorrect = q.quiz_options.some((o) => o.is_correct);
        if (!hasCorrect) {
          toast({ title: `Quiz "${quiz.title}", Q${qqi + 1}: no correct answer selected`, variant: "destructive" });
          return;
        }
        const hasEmpty = q.quiz_options.some((o) => !o.option_text.trim());
        if (hasEmpty) {
          toast({ title: `Quiz "${quiz.title}", Q${qqi + 1}: has blank option text`, variant: "destructive" });
          return;
        }
      }
    }

    setSaving(true);

    try {
      // Delete existing quizzes for this chapter (cascade deletes questions/options)
      const { data: existing } = await (supabase as any)
        .from("chapter_quizzes")
        .select("id")
        .eq("chapter_id", chapterId);

      if (existing && existing.length > 0) {
        const existingIds = existing.map((e: any) => e.id);
        // Delete options, then questions, then quizzes
        const { data: existingQs } = await (supabase as any)
          .from("quiz_questions")
          .select("id")
          .in("quiz_id", existingIds);

        if (existingQs && existingQs.length > 0) {
          await (supabase as any)
            .from("quiz_options")
            .delete()
            .in("question_id", existingQs.map((q: any) => q.id));
          await (supabase as any)
            .from("quiz_questions")
            .delete()
            .in("quiz_id", existingIds);
        }
        await (supabase as any)
          .from("chapter_quizzes")
          .delete()
          .eq("chapter_id", chapterId);
      }

      // Insert fresh
      for (let qi = 0; qi < quizzes.length; qi++) {
        const quiz = quizzes[qi];
        const { data: newQuiz, error: qErr } = await (supabase as any)
          .from("chapter_quizzes")
          .insert({
            chapter_id: chapterId,
            title: quiz.title,
            description: quiz.description || null,
            pass_percentage: quiz.pass_percentage,
            is_active: quiz.is_active,
            sort_order: qi,
          })
          .select("id")
          .single();

        if (qErr || !newQuiz) {
          throw new Error(qErr?.message || "Failed to insert quiz");
        }

        for (let qqi = 0; qqi < quiz.quiz_questions.length; qqi++) {
          const question = quiz.quiz_questions[qqi];
          const { data: newQ, error: qqErr } = await (supabase as any)
            .from("quiz_questions")
            .insert({
              quiz_id: newQuiz.id,
              question_text: question.question_text,
              question_type: question.question_type,
              explanation: question.explanation || null,
              sort_order: qqi,
            })
            .select("id")
            .single();

          if (qqErr || !newQ) {
            throw new Error(qqErr?.message || "Failed to insert question");
          }

          const optRows = question.quiz_options.map((o, oi) => ({
            question_id: newQ.id,
            option_text: o.option_text,
            is_correct: o.is_correct,
            sort_order: oi,
          }));

          if (optRows.length > 0) {
            const { error: oErr } = await (supabase as any)
              .from("quiz_options")
              .insert(optRows);
            if (oErr) throw new Error(oErr.message);
          }
        }
      }

      toast({ title: "Quizzes saved" });
      loadData();
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AdminLayout title="Quiz Editor">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Quiz Editor">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/courses/${courseId}/curriculum`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{chapterTitle}</h2>
          <p className="text-sm text-muted-foreground">Manage quizzes for this chapter</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save All
        </Button>
      </div>

      <div className="space-y-8">
        {quizzes.map((quiz, qi) => (
          <div key={quiz.id} className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <Input
                  placeholder="Quiz title"
                  value={quiz.title}
                  onChange={(e) => updateQuiz(qi, "title", e.target.value)}
                  className="text-lg font-semibold"
                />
                <Textarea
                  placeholder="Description (optional)"
                  value={quiz.description}
                  onChange={(e) => updateQuiz(qi, "description", e.target.value)}
                  rows={2}
                />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Pass %</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={quiz.pass_percentage}
                      onChange={(e) => updateQuiz(qi, "pass_percentage", Number(e.target.value))}
                      className="w-20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Active</label>
                    <Switch
                      checked={quiz.is_active}
                      onCheckedChange={(v) => updateQuiz(qi, "is_active", v)}
                    />
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeQuiz(qi)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Questions */}
            <div className="space-y-4 pl-4 border-l-2 border-border">
              <p className="text-sm font-medium text-muted-foreground">Questions ({quiz.quiz_questions.length})</p>

              {quiz.quiz_questions.map((q, qqi) => (
                <div key={q.id} className="bg-surface rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-mono text-muted-foreground mt-2">Q{qqi + 1}</span>
                    <div className="flex-1 space-y-3">
                      <Textarea
                        placeholder="Question text"
                        value={q.question_text}
                        onChange={(e) => updateQuestion(qi, qqi, "question_text", e.target.value)}
                        rows={2}
                      />
                      <div className="flex items-center gap-4">
                        <Select
                          value={q.question_type}
                          onValueChange={(v) => updateQuestion(qi, qqi, "question_type", v)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mcq">MCQ</SelectItem>
                            <SelectItem value="true_false">True / False</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Explanation (optional)"
                          value={q.explanation}
                          onChange={(e) => updateQuestion(qi, qqi, "explanation", e.target.value)}
                          className="flex-1"
                        />
                      </div>

                      {/* Options */}
                      <div className="space-y-2">
                        {q.quiz_options.map((o, oi) => (
                          <div key={o.id} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={o.is_correct}
                              onChange={() => setCorrectOption(qi, qqi, oi)}
                              className="accent-emerald-500"
                            />
                            <Input
                              placeholder={`Option ${oi + 1}`}
                              value={o.option_text}
                              onChange={(e) => updateOption(qi, qqi, oi, "option_text", e.target.value)}
                              className={`flex-1 ${o.is_correct ? "border-emerald-500/50" : ""}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(qi, qqi, oi)}
                              disabled={q.quiz_options.length <= 2}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => addOption(qi, qqi)}>
                          <Plus className="h-3 w-3 mr-1" /> Add Option
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQuestion(qi, qqi)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={() => addQuestion(qi)}>
                <Plus className="h-4 w-4 mr-1" /> Add Question
              </Button>
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addQuiz} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add Quiz
        </Button>
      </div>
    </AdminLayout>
  );
};

export default AdminQuizEditor;
