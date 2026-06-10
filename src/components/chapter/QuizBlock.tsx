import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { hapticNotification } from "@/lib/haptics";

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

  // Load previous attempt on mount. Column is `total`, not `total_questions`;
  // prior code referenced a non-existent column.
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

    // Server-side scoring: the RPC verifies enrolment, reads is_correct
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
      toast.error(`Not quite. ${score}/${total}. You need ${quiz.pass_percentage}% to pass.`);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setSubmitted(false);
    setResult(null);
  };

  if (loadingAttempt) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-1/3 mb-2" />
        <div className="h-3 bg-surface-2 rounded w-1/2" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
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
            {result.passed ? "PASSED" : "FAILED"} - {result.score}/{result.total}
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
            className="btn-champagne px-5 text-[hsl(var(--cream-text))]"
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

export default QuizBlock;
